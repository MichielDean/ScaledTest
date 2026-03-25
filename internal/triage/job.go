package triage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/webhook"
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

// webhookNotifier is the subset of webhook.Notifier used by Runner to fire
// run.triage_complete events. An interface is used so tests can substitute a fake.
type webhookNotifier interface {
	Notify(teamID string, event webhook.EventType, data interface{})
}

// githubStatusPoster posts a GitHub commit status.
// Implemented by *github.Client (internal/github).
type githubStatusPoster interface {
	PostStatus(ctx context.Context, owner, repo, sha, state, description, statusContext, targetURL string) error
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
	Repository         string `json:"repository"`
	Commit             string `json:"commit"`
	Branch             string `json:"branch"`
	TriageGitHubStatus bool   // not JSON; populated from triage_github_status DB column
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
	webhooks     webhookNotifier
	statusPoster githubStatusPoster // nil when GitHub integration is disabled
	baseURL      string             // used to construct target URLs in GitHub statuses
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

// SetWebhookNotifier configures the notifier used to fire run.triage_complete
// events. Safe to call after construction; a nil notifier is accepted (events
// are silently dropped).
func (r *Runner) SetWebhookNotifier(n webhookNotifier) {
	r.webhooks = n
}

// SetStatusPoster configures the GitHub status poster used to post commit
// statuses after triage completes. A nil poster disables status posting.
func (r *Runner) SetStatusPoster(poster githubStatusPoster, baseURL string) {
	r.statusPoster = poster
	r.baseURL = baseURL
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
		r.failTriage(ctx, teamID, triageID, reportID, err.Error(), reportEnv{})
		return fmt.Errorf("triage: fetch failures: %w", err)
	}

	// No failures — complete immediately without calling the LLM.
	if len(failures) == 0 {
		if _, err := r.store.Complete(ctx, teamID, triageID, "", "", "", 0, 0, 0); err != nil {
			log.Warn().Err(err).Str("triage_id", triageID).Msg("triage: mark complete (no failures)")
		}
		r.data.setTriageStatus(ctx, teamID, reportID, "complete")
		r.notifyTriageComplete(teamID, reportID, "complete", "", 0, 0, 0)
		r.postTriageGitHubStatus(env, reportID, "success", triageStatusDescription("", 0))
		return nil
	}

	input := r.buildInput(ctx, teamID, reportID, failures, env)
	output, triageErr := r.engine.Triage(ctx, input)

	// Persist clusters and classifications even on engine error — we
	// persist the fallback output so partial results are available.
	if persistErr := r.persistOutput(ctx, teamID, triageID, output); persistErr != nil {
		r.failTriage(ctx, teamID, triageID, reportID, persistErr.Error(), env)
		return fmt.Errorf("triage: persist output: %w", persistErr)
	}

	if triageErr != nil {
		r.failTriage(ctx, teamID, triageID, reportID, triageErr.Error(), env)
		// Return nil — the error is captured in the record, not a job-level failure.
		return nil
	}

	if _, err := r.store.Complete(ctx, teamID, triageID, output.Summary, "", "", 0, 0, 0); err != nil {
		log.Error().Err(err).Str("triage_id", triageID).Msg("triage: mark complete")
		return fmt.Errorf("triage: mark complete: %w", err)
	}
	r.data.setTriageStatus(ctx, teamID, reportID, "complete")
	newCount, flakyCount := countNewAndFlaky(output)
	r.notifyTriageComplete(teamID, reportID, "complete", output.Summary, len(output.Clusters), newCount, flakyCount)
	state := "success"
	if newCount > 0 {
		state = "failure"
	}
	r.postTriageGitHubStatus(env, reportID, state, triageStatusDescription(output.Summary, newCount))
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

// notifyTriageComplete fires a run.triage_complete webhook event. It is a
// no-op when the notifier is nil.
func (r *Runner) notifyTriageComplete(teamID, reportID, status, summary string, clusterCount, newCount, flakyCount int) {
	if r.webhooks == nil {
		return
	}
	r.webhooks.Notify(teamID, webhook.EventRunTriageComplete, webhook.TriageCompleteData{
		RunID:             reportID,
		TriageStatus:      status,
		Summary:           summary,
		ClusterCount:      clusterCount,
		NewFailureCount:   newCount,
		FlakyFailureCount: flakyCount,
	})
}

// countNewAndFlaky counts new and flaky classifications in output.
func countNewAndFlaky(output *TriageOutput) (newCount, flakyCount int) {
	for _, c := range output.Classifications {
		switch c.Classification {
		case "new":
			newCount++
		case "flaky":
			flakyCount++
		}
	}
	return
}

// triageStatusDescription builds a one-line GitHub commit status description
// from the triage summary and the count of new failures.
func triageStatusDescription(summary string, newCount int) string {
	if summary == "" {
		if newCount == 0 {
			return "Triage complete — no new failures"
		}
		return fmt.Sprintf("Triage: %d new failure(s) detected", newCount)
	}
	// Use first line of summary.
	line := summary
	if idx := strings.IndexByte(summary, '\n'); idx >= 0 {
		line = summary[:idx]
	}
	// Truncate to 140 chars with ellipsis if needed.
	runes := []rune(line)
	if len(runes) > 140 {
		line = string(runes[:140]) + "…"
	}
	return line
}

// postTriageGitHubStatus fires a GitHub commit status in a background goroutine
// when the per-report flag is set and the integration is configured.
// Errors are logged and swallowed — status posting is best-effort.
func (r *Runner) postTriageGitHubStatus(env reportEnv, reportID, state, description string) {
	if !env.TriageGitHubStatus || r.statusPoster == nil {
		return
	}
	owner, repo, ok := analytics.ParseOwnerRepo(env.Repository)
	if !ok || env.Commit == "" {
		return
	}
	var targetURL string
	if r.baseURL != "" {
		targetURL = r.baseURL + "/reports/" + reportID
	}
	poster := r.statusPoster
	commit := env.Commit
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := poster.PostStatus(ctx, owner, repo, commit, state, description, "ci/triage", targetURL); err != nil {
			log.Error().Err(err).
				Str("report_id", reportID).
				Str("sha", commit).
				Msg("triage: failed to post GitHub commit status")
		}
	}()
}

// failTriage marks the triage record as failed and updates the report status.
// Errors are logged rather than returned — the outer run() must not fail
// because the failure-recording step itself failed.
// If env contains GitHub status configuration, an "error" commit status is posted.
func (r *Runner) failTriage(ctx context.Context, teamID, triageID, reportID, errMsg string, env reportEnv) {
	if _, err := r.store.Fail(ctx, teamID, triageID, errMsg); err != nil {
		log.Error().Err(err).Str("triage_id", triageID).Msg("triage: failed to record failure")
	}
	r.data.setTriageStatus(ctx, teamID, reportID, "failed")
	r.notifyTriageComplete(teamID, reportID, "failed", "", 0, 0, 0)
	r.postTriageGitHubStatus(env, reportID, "error", "Triage failed — see run for details")
}

// ---------------------------------------------------------------------------
// pgxReportData — production implementation backed by pgxpool.Pool
// ---------------------------------------------------------------------------

type pgxReportData struct {
	pool *pgxpool.Pool
}

func (d *pgxReportData) fetchFailuresAndEnv(ctx context.Context, teamID, reportID string) ([]FailureDetail, reportEnv, error) {
	var envJSON json.RawMessage
	var triageGitHubStatus bool
	err := d.pool.QueryRow(ctx,
		`SELECT COALESCE(environment, '{}'::jsonb), COALESCE(triage_github_status, FALSE)
		 FROM test_reports WHERE id = $1 AND team_id = $2`,
		reportID, teamID).Scan(&envJSON, &triageGitHubStatus)
	if err != nil {
		return nil, reportEnv{}, fmt.Errorf("fetch report environment: %w", err)
	}

	var env reportEnv
	_ = json.Unmarshal(envJSON, &env) // ignore parse errors — enrichment fields are optional
	env.TriageGitHubStatus = triageGitHubStatus

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
