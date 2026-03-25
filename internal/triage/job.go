package triage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/model"
)

// jobTimeout is the maximum wall-clock time a single triage job may run.
const jobTimeout = 5 * time.Minute

// triageWorkerLimit is the maximum number of triage jobs that may run
// concurrently. Calls to Enqueue beyond this limit are dropped with a warning
// rather than spawning unbounded goroutines.
const triageWorkerLimit = 10

// Enqueuer submits a background triage job for a completed report.
// Implementations must be non-blocking — the caller (report ingest handler)
// must not be delayed by triage work.
type Enqueuer interface {
	Enqueue(teamID, reportID string)
}

// triageStorer is the subset of store.TriageStore operations used by Runner.
// Defined as an interface so tests can substitute a fake without a live DB.
type triageStorer interface {
	CreateOrReset(ctx context.Context, teamID, reportID string) (*model.TriageResult, error)
	Complete(ctx context.Context, teamID, triageID, summary, llmProvider, llmModel string, inputTokens, outputTokens int, costUSD float64) (*model.TriageResult, error)
	Fail(ctx context.Context, teamID, triageID, errorMsg string) (*model.TriageResult, error)
	CreateCluster(ctx context.Context, triageID, teamID, rootCause string, label *string) (*model.TriageCluster, error)
	CreateClassification(ctx context.Context, triageID string, clusterID *string, testResultID, teamID, classification string) (*model.TriageFailureClassification, error)
}

// reportData abstracts the pool-level queries on test_reports and test_results.
// The production implementation is pgxReportData; tests use fakeReportData.
type reportData interface {
	fetchFailuresAndEnv(ctx context.Context, teamID, reportID string) ([]FailureDetail, reportEnv, error)
	// fetchPreviousFailures returns the failing test names from the most recent
	// prior report for the same team and repository. repository may be empty,
	// in which case no repository filter is applied.
	fetchPreviousFailures(ctx context.Context, teamID, reportID, repository string) ([]string, error)
	setTriageStatus(ctx context.Context, teamID, reportID, status string)
}

// reportEnv holds the CTRF environment fields relevant to triage enrichment.
type reportEnv struct {
	Repository string `json:"repository"`
	Commit     string `json:"commit"`
	Branch     string `json:"branch"`
}

// Runner executes triage jobs asynchronously. Create one with NewRunner and
// pass it to ReportsHandler.TriageEnqueuer.
//
// Each Enqueue call launches a goroutine that:
//  1. Claims a pending triage slot (idempotency — skips if already pending/complete)
//  2. Fetches failing test results and report environment
//  3. Builds enrichment context (flakiness history, git diff, previous failures)
//  4. Invokes the triage engine
//  5. Persists clusters and classifications
//  6. Marks the triage result and test_reports.triage_status as complete or failed
//
// Job failure never propagates back to the HTTP response — the report ingest
// always returns 201 regardless of triage outcome.
//
// Concurrency is bounded by triageWorkerLimit; Enqueue calls that exceed the
// limit are dropped with a warning rather than spawning unbounded goroutines.
type Runner struct {
	engine       *Engine
	store        triageStorer
	data         reportData
	historyRdr   analytics.HistoryReader
	diffEnricher *analytics.GitDiffEnricher
	sem          chan struct{} // bounded semaphore; capacity = triageWorkerLimit
}

// NewRunner constructs a Runner backed by a live pgxpool. historyRdr and
// diffEnricher may be nil; triage proceeds without the corresponding
// enrichment when they are absent.
func NewRunner(
	pool *pgxpool.Pool,
	engine *Engine,
	store triageStorer,
	historyRdr analytics.HistoryReader,
	diffEnricher *analytics.GitDiffEnricher,
) *Runner {
	return &Runner{
		engine:       engine,
		store:        store,
		data:         &pgxReportData{pool: pool},
		historyRdr:   historyRdr,
		diffEnricher: diffEnricher,
		sem:          make(chan struct{}, triageWorkerLimit),
	}
}

// Enqueue launches a background goroutine that runs the triage job for the
// given team/report. It returns immediately; errors are logged but do not
// surface to the caller.
//
// Concurrency is bounded: if triageWorkerLimit jobs are already in flight the
// new job is dropped with a warning log rather than spawning an extra goroutine.
func (r *Runner) Enqueue(teamID, reportID string) {
	select {
	case r.sem <- struct{}{}:
		go func() {
			defer func() { <-r.sem }()
			ctx, cancel := context.WithTimeout(context.Background(), jobTimeout)
			defer cancel()
			if err := r.run(ctx, teamID, reportID); err != nil {
				log.Error().Err(err).
					Str("team_id", teamID).
					Str("report_id", reportID).
					Msg("triage job error")
			}
		}()
	default:
		log.Warn().
			Str("team_id", teamID).
			Str("report_id", reportID).
			Msg("triage: worker limit reached, triage job dropped")
	}
}

// run executes the triage pipeline synchronously.
// Infrastructure errors (DB unreachable) are returned; triage-specific errors
// (engine failure, parse error) are captured in the triage record and do not
// surface as return values.
func (r *Runner) run(ctx context.Context, teamID, reportID string) error {
	// Claim a pending slot — idempotency gate.
	result, err := r.store.CreateOrReset(ctx, teamID, reportID)
	if err != nil {
		return fmt.Errorf("triage: claim slot: %w", err)
	}
	if result == nil {
		// Row already exists in 'pending' or 'complete' — nothing to do.
		return nil
	}
	triageID := result.ID

	// Mark the report as triage-pending so it's immediately queryable.
	r.data.setTriageStatus(ctx, teamID, reportID, "pending")

	failures, env, err := r.data.fetchFailuresAndEnv(ctx, teamID, reportID)
	if err != nil {
		r.failTriage(ctx, teamID, triageID, reportID, err.Error())
		return fmt.Errorf("triage: fetch failures: %w", err)
	}

	// No failures — complete immediately without calling the LLM.
	if len(failures) == 0 {
		if _, err := r.store.Complete(ctx, teamID, triageID, "", "", "", 0, 0, 0); err != nil {
			log.Warn().Err(err).Str("triage_id", triageID).Msg("triage: mark complete (no failures)")
		}
		r.data.setTriageStatus(ctx, teamID, reportID, "complete")
		return nil
	}

	input := r.buildInput(ctx, teamID, reportID, failures, env)
	output, triageErr := r.engine.Triage(ctx, input)

	// Persist clusters and classifications even on engine error — we
	// persist the fallback output so partial results are available.
	if persistErr := r.persistOutput(ctx, teamID, triageID, output); persistErr != nil {
		r.failTriage(ctx, teamID, triageID, reportID, persistErr.Error())
		return fmt.Errorf("triage: persist output: %w", persistErr)
	}

	if triageErr != nil {
		r.failTriage(ctx, teamID, triageID, reportID, triageErr.Error())
		// Return nil — the error is captured in the record, not a job-level failure.
		return nil
	}

	if _, err := r.store.Complete(ctx, teamID, triageID, output.Summary, "", "", 0, 0, 0); err != nil {
		log.Error().Err(err).Str("triage_id", triageID).Msg("triage: mark complete")
		return fmt.Errorf("triage: mark complete: %w", err)
	}
	r.data.setTriageStatus(ctx, teamID, reportID, "complete")
	return nil
}

// buildInput assembles a TriageInput from raw failures and optional enrichment.
// Enrichment errors are logged but do not abort the job.
func (r *Runner) buildInput(ctx context.Context, teamID, reportID string, failures []FailureDetail, env reportEnv) TriageInput {
	input := TriageInput{Failures: failures}

	// Flakiness history.
	if r.historyRdr != nil {
		names := make([]string, len(failures))
		for i, f := range failures {
			names[i] = f.Name
		}
		histRows, err := r.historyRdr.ReadHistory(ctx, analytics.HistoryQuery{
			TeamID:     teamID,
			TestNames:  names,
			Branch:     env.Branch,
			Repository: env.Repository,
		})
		if err != nil {
			log.Warn().Err(err).Str("report_id", reportID).Msg("triage: flakiness history unavailable")
		} else {
			input.FlakinessHistory = analytics.BuildFlakinessSummaries(
				analytics.HistoryQuery{TestNames: names},
				histRows,
			)
		}
	}

	// Git diff enrichment.
	if r.diffEnricher != nil && env.Repository != "" && env.Commit != "" {
		diff, err := r.diffEnricher.Enrich(ctx, analytics.GitDiffQuery{
			TeamID:          teamID,
			Repository:      env.Repository,
			HeadSHA:         env.Commit,
			Branch:          env.Branch,
			ExcludeReportID: reportID,
		})
		if err != nil {
			log.Warn().Err(err).Str("report_id", reportID).Msg("triage: git diff unavailable")
		} else {
			input.GitDiff = diff
		}
	}

	// Previous run failures — scoped to the same repository so cross-repo
	// results from other projects in the team don't pollute the context.
	prevFailed, err := r.data.fetchPreviousFailures(ctx, teamID, reportID, env.Repository)
	if err != nil {
		log.Warn().Err(err).Str("report_id", reportID).Msg("triage: previous failures unavailable")
	} else {
		input.PreviousFailures = prevFailed
	}

	return input
}

// persistOutput writes clusters and classifications from output to the DB.
// It uses the cluster insertion order to map ClassificationResult.ClusterIndex
// back to the UUID assigned by the DB.
func (r *Runner) persistOutput(ctx context.Context, teamID, triageID string, output *TriageOutput) error {
	// Insert clusters and collect their assigned UUIDs.
	clusterIDs := make([]*string, len(output.Clusters))
	for i, cluster := range output.Clusters {
		var lblPtr *string
		if cluster.Label != "" {
			lbl := cluster.Label
			lblPtr = &lbl
		}
		c, err := r.store.CreateCluster(ctx, triageID, teamID, cluster.RootCause, lblPtr)
		if err != nil {
			return fmt.Errorf("create cluster[%d]: %w", i, err)
		}
		clusterIDs[i] = &c.ID
	}

	// Insert per-failure classifications.
	for _, cl := range output.Classifications {
		var clusterID *string
		if cl.ClusterIndex >= 0 && cl.ClusterIndex < len(clusterIDs) {
			clusterID = clusterIDs[cl.ClusterIndex]
		}
		if _, err := r.store.CreateClassification(ctx, triageID, clusterID, cl.TestResultID, teamID, cl.Classification); err != nil {
			return fmt.Errorf("create classification for %s: %w", cl.TestResultID, err)
		}
	}
	return nil
}

// failTriage marks the triage record as failed and updates the report status.
// Errors are logged rather than returned — the outer run() must not fail
// because the failure-recording step itself failed.
func (r *Runner) failTriage(ctx context.Context, teamID, triageID, reportID, errMsg string) {
	if _, err := r.store.Fail(ctx, teamID, triageID, errMsg); err != nil {
		log.Error().Err(err).Str("triage_id", triageID).Msg("triage: failed to record failure")
	}
	r.data.setTriageStatus(ctx, teamID, reportID, "failed")
}

// ---------------------------------------------------------------------------
// pgxReportData — production implementation backed by pgxpool.Pool
// ---------------------------------------------------------------------------

type pgxReportData struct {
	pool *pgxpool.Pool
}

func (d *pgxReportData) fetchFailuresAndEnv(ctx context.Context, teamID, reportID string) ([]FailureDetail, reportEnv, error) {
	var envJSON json.RawMessage
	err := d.pool.QueryRow(ctx,
		`SELECT COALESCE(environment, '{}'::jsonb) FROM test_reports WHERE id = $1 AND team_id = $2`,
		reportID, teamID).Scan(&envJSON)
	if err != nil {
		return nil, reportEnv{}, fmt.Errorf("fetch report environment: %w", err)
	}

	var env reportEnv
	_ = json.Unmarshal(envJSON, &env) // ignore parse errors — enrichment fields are optional

	rows, err := d.pool.Query(ctx,
		`SELECT id, name, COALESCE(suite,''), COALESCE(message,''), COALESCE(trace,''), duration_ms
		 FROM test_results
		 WHERE report_id = $1 AND team_id = $2 AND status = 'failed'`,
		reportID, teamID)
	if err != nil {
		return nil, env, fmt.Errorf("fetch failing tests: %w", err)
	}
	defer rows.Close()

	var failures []FailureDetail
	for rows.Next() {
		var f FailureDetail
		if err := rows.Scan(&f.TestResultID, &f.Name, &f.Suite, &f.Message, &f.Trace, &f.DurationMs); err != nil {
			return nil, env, fmt.Errorf("scan failure row: %w", err)
		}
		failures = append(failures, f)
	}
	return failures, env, rows.Err()
}

func (d *pgxReportData) fetchPreviousFailures(ctx context.Context, teamID, reportID, repository string) ([]string, error) {
	var prevReportID string
	var err error
	// Scope by repository when available to avoid cross-project contamination.
	if repository != "" {
		err = d.pool.QueryRow(ctx,
			`SELECT id FROM test_reports
			 WHERE team_id = $1 AND id != $2
			   AND environment->>'repository' = $3
			 ORDER BY created_at DESC LIMIT 1`,
			teamID, reportID, repository).Scan(&prevReportID)
	} else {
		err = d.pool.QueryRow(ctx,
			`SELECT id FROM test_reports
			 WHERE team_id = $1 AND id != $2
			 ORDER BY created_at DESC LIMIT 1`,
			teamID, reportID).Scan(&prevReportID)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("fetch previous report: %w", err)
	}

	// team_id is required on every query touching user data (defense-in-depth).
	rows, err := d.pool.Query(ctx,
		`SELECT name FROM test_results WHERE report_id = $1 AND status = 'failed' AND team_id = $2`,
		prevReportID, teamID)
	if err != nil {
		return nil, fmt.Errorf("fetch previous failures: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan previous failure name: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func (d *pgxReportData) setTriageStatus(ctx context.Context, teamID, reportID, status string) {
	if _, err := d.pool.Exec(ctx,
		`UPDATE test_reports SET triage_status = $1 WHERE id = $2 AND team_id = $3`,
		status, reportID, teamID); err != nil {
		log.Warn().Err(err).
			Str("report_id", reportID).
			Str("triage_status", status).
			Msg("triage: failed to update report triage_status")
	}
}
