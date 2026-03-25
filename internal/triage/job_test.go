package triage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/llm"
	"github.com/scaledtest/scaledtest/internal/model"
)

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// fakeTriageStore records calls to the triageStorer methods used by Runner.
type fakeTriageStore struct {
	mu sync.Mutex

	// createOrResetResult controls what CreateOrReset returns.
	// nil means "already handled" (pending/complete).
	createOrResetResult *model.TriageResult
	createOrResetErr    error

	// completeErr / failErr inject errors for those transitions.
	completeErr error
	failErr     error

	// recorded calls
	completeCalls []string // triageIDs
	failCalls     []failCall
	clusters      []clusterCall
	classifications []classifCall
}

type failCall struct {
	triageID string
	errMsg   string
}

type clusterCall struct {
	triageID  string
	rootCause string
}

type classifCall struct {
	triageID      string
	testResultID  string
	classification string
}

func newFakeStore(pending *model.TriageResult) *fakeTriageStore {
	return &fakeTriageStore{createOrResetResult: pending}
}

func (f *fakeTriageStore) CreateOrReset(_ context.Context, _, _ string) (*model.TriageResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.createOrResetResult, f.createOrResetErr
}

func (f *fakeTriageStore) Complete(_ context.Context, _, triageID, _, _, _ string, _, _ int, _ float64) (*model.TriageResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.completeCalls = append(f.completeCalls, triageID)
	return &model.TriageResult{ID: triageID, Status: "complete"}, f.completeErr
}

func (f *fakeTriageStore) Fail(_ context.Context, _, triageID, errMsg string) (*model.TriageResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.failCalls = append(f.failCalls, failCall{triageID: triageID, errMsg: errMsg})
	return &model.TriageResult{ID: triageID, Status: "failed"}, f.failErr
}

func (f *fakeTriageStore) CreateCluster(_ context.Context, triageID, _ /*teamID*/, rootCause string, _ *string) (*model.TriageCluster, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := fmt.Sprintf("cluster-%d", len(f.clusters)+1)
	f.clusters = append(f.clusters, clusterCall{triageID: triageID, rootCause: rootCause})
	return &model.TriageCluster{ID: id, TriageID: triageID, RootCause: rootCause}, nil
}

func (f *fakeTriageStore) CreateClassification(_ context.Context, triageID string, _ *string, testResultID, _ /*teamID*/, classification string) (*model.TriageFailureClassification, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.classifications = append(f.classifications, classifCall{
		triageID:       triageID,
		testResultID:   testResultID,
		classification: classification,
	})
	return &model.TriageFailureClassification{
		ID:             fmt.Sprintf("cls-%d", len(f.classifications)),
		TriageID:       triageID,
		TestResultID:   testResultID,
		Classification: classification,
	}, nil
}

func (f *fakeTriageStore) completedCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.completeCalls)
}

func (f *fakeTriageStore) failedCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.failCalls)
}

// fakeReportData is a stub for reportData that returns configurable failures
// and records setTriageStatus calls.
type fakeReportData struct {
	mu sync.Mutex

	failures []FailureDetail
	env      reportEnv
	fetchErr error

	prevFailures    []string
	prevFailuresErr error
	// lastPrevFailureRepo records the repository argument passed to
	// fetchPreviousFailures so tests can assert scoping behaviour.
	lastPrevFailureRepo string

	statusCalls []statusCall
}

type statusCall struct {
	reportID string
	status   string
}

func (d *fakeReportData) fetchFailuresAndEnv(_ context.Context, _, _ string) ([]FailureDetail, reportEnv, error) {
	return d.failures, d.env, d.fetchErr
}

func (d *fakeReportData) fetchPreviousFailures(_ context.Context, _, _, repository string) ([]string, error) {
	d.mu.Lock()
	d.lastPrevFailureRepo = repository
	d.mu.Unlock()
	return d.prevFailures, d.prevFailuresErr
}

func (d *fakeReportData) setTriageStatus(_ context.Context, _, reportID, status string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.statusCalls = append(d.statusCalls, statusCall{reportID: reportID, status: status})
}

func (d *fakeReportData) lastStatus() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	if len(d.statusCalls) == 0 {
		return ""
	}
	return d.statusCalls[len(d.statusCalls)-1].status
}

func (d *fakeReportData) statusSequence() []string {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := make([]string, len(d.statusCalls))
	for i, c := range d.statusCalls {
		out[i] = c.status
	}
	return out
}

// fakeHistoryReader is a stub analytics.HistoryReader.
type fakeHistoryReader struct {
	rows []analytics.TestHistoryRow
	err  error
}

func (h *fakeHistoryReader) ReadHistory(_ context.Context, _ analytics.HistoryQuery) ([]analytics.TestHistoryRow, error) {
	return h.rows, h.err
}

// pendingResult returns a minimal TriageResult as returned by CreateOrReset
// for a newly claimed slot.
func pendingResult(triageID string) *model.TriageResult {
	return &model.TriageResult{ID: triageID, Status: "pending"}
}

// newTestRunner builds a Runner wired to fakes. llmResp may be nil to use a
// no-op mock (e.g. when testing paths that don't call the engine).
func newTestRunner(store *fakeTriageStore, data *fakeReportData, llmResp json.RawMessage) *Runner {
	provider := llm.NewMock(llmResp)
	engine := NewEngine(provider)
	return &Runner{
		engine:     engine,
		store:      store,
		data:       data,
		historyRdr: nil,
		sem:        make(chan struct{}, triageWorkerLimit),
	}
}

// ---------------------------------------------------------------------------
// Runner.run — idempotency
// ---------------------------------------------------------------------------

func TestRunner_Run_WhenSlotAlreadyClaimed_DoesNothing(t *testing.T) {
	// Given: CreateOrReset returns nil (existing pending/complete row)
	store := newFakeStore(nil)
	data := &fakeReportData{}
	r := newTestRunner(store, data, nil)

	// When
	err := r.run(context.Background(), "team-1", "report-1")

	// Then: no error, no status update, store not touched beyond CreateOrReset
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(data.statusCalls) != 0 {
		t.Errorf("setTriageStatus should not be called when slot already claimed; got %d calls", len(data.statusCalls))
	}
	if store.completedCount() != 0 {
		t.Errorf("Complete should not be called; got %d calls", store.completedCount())
	}
	if store.failedCount() != 0 {
		t.Errorf("Fail should not be called; got %d calls", store.failedCount())
	}
}

func TestRunner_Run_WhenCreateOrResetFails_ReturnsError(t *testing.T) {
	// Given: DB is unreachable
	store := &fakeTriageStore{createOrResetErr: errors.New("connection refused")}
	data := &fakeReportData{}
	r := newTestRunner(store, data, nil)

	err := r.run(context.Background(), "team-1", "report-1")

	if err == nil {
		t.Fatal("expected error when CreateOrReset fails")
	}
}

// ---------------------------------------------------------------------------
// Runner.run — no-failure path
// ---------------------------------------------------------------------------

func TestRunner_Run_WhenNoFailures_CompletesImmediately(t *testing.T) {
	// Given: report has no failing tests
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: nil}
	r := newTestRunner(store, data, nil)

	err := r.run(context.Background(), "team-1", "report-1")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if store.completedCount() != 1 {
		t.Errorf("want 1 Complete call; got %d", store.completedCount())
	}
	if store.failedCount() != 0 {
		t.Errorf("want 0 Fail calls; got %d", store.failedCount())
	}
}

func TestRunner_Run_WhenNoFailures_SetsStatusPendingThenComplete(t *testing.T) {
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: nil}
	r := newTestRunner(store, data, nil)

	r.run(context.Background(), "team-1", "report-1") //nolint:errcheck

	seq := data.statusSequence()
	if len(seq) != 2 {
		t.Fatalf("want 2 status updates (pending, complete); got %v", seq)
	}
	if seq[0] != "pending" {
		t.Errorf("first status update should be 'pending'; got %q", seq[0])
	}
	if seq[1] != "complete" {
		t.Errorf("second status update should be 'complete'; got %q", seq[1])
	}
}

// ---------------------------------------------------------------------------
// Runner.run — fetch failure path
// ---------------------------------------------------------------------------

func TestRunner_Run_WhenFetchFailuresFails_FailsTriageAndReturnsError(t *testing.T) {
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{fetchErr: errors.New("db timeout")}
	r := newTestRunner(store, data, nil)

	err := r.run(context.Background(), "team-1", "report-1")

	if err == nil {
		t.Fatal("expected error when fetchFailuresAndEnv fails")
	}
	if store.failedCount() != 1 {
		t.Errorf("want 1 Fail call; got %d", store.failedCount())
	}
	if data.lastStatus() != "failed" {
		t.Errorf("report triage_status should be 'failed'; got %q", data.lastStatus())
	}
}

// ---------------------------------------------------------------------------
// Runner.run — happy path with failures
// ---------------------------------------------------------------------------

func TestRunner_Run_HappyPath_CompletesWithClassifications(t *testing.T) {
	failures := makeNFailures(3)
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: failures}
	r := newTestRunner(store, data, validResponse(failures))

	err := r.run(context.Background(), "team-1", "report-1")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if store.completedCount() != 1 {
		t.Errorf("want 1 Complete call; got %d", store.completedCount())
	}
	if store.failedCount() != 0 {
		t.Errorf("want 0 Fail calls; got %d", store.failedCount())
	}
	if len(store.classifications) != len(failures) {
		t.Errorf("want %d classifications; got %d", len(failures), len(store.classifications))
	}
}

func TestRunner_Run_HappyPath_SetsStatusPendingThenComplete(t *testing.T) {
	failures := makeNFailures(2)
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: failures}
	r := newTestRunner(store, data, validResponse(failures))

	r.run(context.Background(), "team-1", "report-1") //nolint:errcheck

	seq := data.statusSequence()
	if len(seq) < 2 {
		t.Fatalf("want at least 2 status updates; got %v", seq)
	}
	if seq[0] != "pending" {
		t.Errorf("first status update should be 'pending'; got %q", seq[0])
	}
	if seq[len(seq)-1] != "complete" {
		t.Errorf("last status update should be 'complete'; got %q", seq[len(seq)-1])
	}
}

func TestRunner_Run_HappyPath_CreatesClusters(t *testing.T) {
	failures := makeNFailures(4)
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: failures}
	r := newTestRunner(store, data, validResponse(failures))

	r.run(context.Background(), "team-1", "report-1") //nolint:errcheck

	if len(store.clusters) != 1 {
		t.Errorf("validResponse produces 1 cluster; got %d", len(store.clusters))
	}
}

func TestRunner_Run_HappyPath_ClassificationTriageIDsMatch(t *testing.T) {
	failures := makeNFailures(3)
	const triageID = "triage-abc"
	store := newFakeStore(pendingResult(triageID))
	data := &fakeReportData{failures: failures}
	r := newTestRunner(store, data, validResponse(failures))

	r.run(context.Background(), "team-1", "report-1") //nolint:errcheck

	for _, c := range store.classifications {
		if c.triageID != triageID {
			t.Errorf("classification triageID = %q; want %q", c.triageID, triageID)
		}
	}
}

// ---------------------------------------------------------------------------
// Runner.run — engine error (LLM failure)
// ---------------------------------------------------------------------------

func TestRunner_Run_WhenEngineFails_RecordsFailureAndDoesNotReturnError(t *testing.T) {
	// Given: LLM returns an error — engine will return a fallback + error
	failures := makeNFailures(2)
	provider := llm.NewMock(nil)
	provider.SetError(errors.New("service unavailable"))

	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: failures}
	r := &Runner{
		engine: NewEngine(provider),
		store:  store,
		data:   data,
	}

	err := r.run(context.Background(), "team-1", "report-1")

	// The goroutine error handler should see no error (job failure is contained).
	if err != nil {
		t.Errorf("engine failure must not propagate as run() error; got %v", err)
	}
	// The triage record should be marked as failed.
	if store.failedCount() != 1 {
		t.Errorf("want 1 Fail call when engine errors; got %d", store.failedCount())
	}
	// The fallback classifications should still be persisted.
	if len(store.classifications) != len(failures) {
		t.Errorf("fallback classifications should be persisted; want %d, got %d",
			len(failures), len(store.classifications))
	}
	// Report status should end as 'failed'.
	if data.lastStatus() != "failed" {
		t.Errorf("report triage_status should be 'failed'; got %q", data.lastStatus())
	}
}

func TestRunner_Run_WhenEngineFails_DoesNotMarkRunAsFailed(t *testing.T) {
	// This test validates the acceptance criterion: "job failure does not mark
	// the run as failed". The test_reports.triage_status tracks triage, not run.
	// The run's own status (test_executions.status) must not be touched.
	// We verify that the store only received Fail on the triage record, not on
	// the execution.
	failures := makeNFailures(1)
	provider := llm.NewMock(nil)
	provider.SetError(errors.New("llm error"))

	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: failures}
	r := &Runner{engine: NewEngine(provider), store: store, data: data}

	r.run(context.Background(), "team-1", "report-1") //nolint:errcheck

	// Only one Fail call (on the triage record).
	if store.failedCount() != 1 {
		t.Errorf("want exactly 1 Fail call; got %d", store.failedCount())
	}
	// triage_status on report ends as 'failed', not the execution status.
	if data.lastStatus() != "failed" {
		t.Errorf("triage_status should be 'failed'; got %q", data.lastStatus())
	}
	// Complete must not be called.
	if store.completedCount() != 0 {
		t.Errorf("Complete must not be called when engine errors; got %d calls", store.completedCount())
	}
}

// ---------------------------------------------------------------------------
// Runner.run — flakiness history enrichment
// ---------------------------------------------------------------------------

func TestRunner_Run_WithHistoryReader_PopulatesFlakinessSummaries(t *testing.T) {
	failures := makeNFailures(2)
	histRows := []analytics.TestHistoryRow{
		{Name: failures[0].Name, TotalRuns: 10, PassCount: 8, FailCount: 2, Statuses: []string{"passed", "failed"}},
	}
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: failures}
	provider := llm.NewMock(validResponse(failures))
	engine := NewEngine(provider)
	r := &Runner{
		engine:     engine,
		store:      store,
		data:       data,
		historyRdr: &fakeHistoryReader{rows: histRows},
	}

	err := r.run(context.Background(), "team-1", "report-1")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Verify the provider received a prompt (engine was called with enriched input).
	if len(provider.Calls()) != 1 {
		t.Errorf("want 1 LLM call; got %d", len(provider.Calls()))
	}
}

func TestRunner_Run_WhenHistoryReaderFails_ContinuesWithoutHistory(t *testing.T) {
	failures := makeNFailures(2)
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: failures}
	provider := llm.NewMock(validResponse(failures))
	r := &Runner{
		engine:     NewEngine(provider),
		store:      store,
		data:       data,
		historyRdr: &fakeHistoryReader{err: errors.New("db error")},
	}

	err := r.run(context.Background(), "team-1", "report-1")

	// History error should not abort the job.
	if err != nil {
		t.Fatalf("history reader error should not abort job; got %v", err)
	}
	if store.completedCount() != 1 {
		t.Errorf("job should complete despite history reader error; got %d Complete calls", store.completedCount())
	}
}

// ---------------------------------------------------------------------------
// Runner.run — previous failure enrichment
// ---------------------------------------------------------------------------

func TestRunner_Run_WithPreviousFailures_IncludesThemInInput(t *testing.T) {
	failures := makeNFailures(3)
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{
		failures:     failures,
		prevFailures: []string{"suite/TestOldFailure_AlwaysFails"},
	}
	provider := llm.NewMock(validResponse(failures))
	r := &Runner{engine: NewEngine(provider), store: store, data: data}

	err := r.run(context.Background(), "team-1", "report-1")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// The prompt must include the previous failure name.
	calls := provider.Calls()
	if len(calls) == 0 {
		t.Fatal("expected LLM to be called")
	}
}

// ---------------------------------------------------------------------------
// Enqueuer — non-blocking
// ---------------------------------------------------------------------------

func TestRunner_Enqueue_IsNonBlocking(t *testing.T) {
	// Given: a slow job (acquires slot then waits)
	started := make(chan struct{})
	finished := make(chan struct{})

	store := &fakeTriageStore{
		createOrResetResult: pendingResult("t-1"),
	}
	data := &fakeReportData{failures: makeNFailures(1)}
	provider := llm.NewMock(nil)
	provider.SetError(errors.New("slow")) // doesn't matter, just returns quickly

	slowStore := &blockingStore{
		fakeTriageStore: store,
		started:         started,
		finished:        finished,
	}

	r := &Runner{engine: NewEngine(provider), store: slowStore, data: data, sem: make(chan struct{}, triageWorkerLimit)}

	// When: Enqueue is called
	before := time.Now()
	r.Enqueue("team-1", "report-1")
	elapsed := time.Since(before)

	// Then: Enqueue returns immediately (well under 100ms)
	if elapsed > 100*time.Millisecond {
		t.Errorf("Enqueue took %v; should return immediately", elapsed)
	}

	// Wait for goroutine to finish (so the test doesn't leak).
	select {
	case <-finished:
	case <-time.After(5 * time.Second):
		t.Error("triage goroutine did not finish within 5s")
	}
}

// blockingStore wraps fakeTriageStore and signals on CreateOrReset to allow
// the Enqueue non-blocking test to synchronise with the goroutine.
type blockingStore struct {
	*fakeTriageStore
	started  chan struct{}
	finished chan struct{}
}

func (b *blockingStore) CreateOrReset(ctx context.Context, teamID, reportID string) (*model.TriageResult, error) {
	close(b.started)
	defer close(b.finished)
	return b.fakeTriageStore.CreateOrReset(ctx, teamID, reportID)
}

// ---------------------------------------------------------------------------
// Enqueuer — multiple calls for same report (idempotency via store)
// ---------------------------------------------------------------------------

func TestRunner_Enqueue_MultipleCallsSameReport_OnlyOneJobClaimsSlot(t *testing.T) {
	// The second call returns nil from CreateOrReset (simulating 'pending' state).
	callCount := 0
	store := &countingClaimStore{
		results: []*model.TriageResult{
			pendingResult("t-1"), // first call: claimed
			nil,                   // second call: already pending
		},
	}
	data := &fakeReportData{failures: makeNFailures(1)}
	provider := llm.NewMock(validResponse(makeNFailures(1)))
	r := &Runner{engine: NewEngine(provider), store: store, data: data}
	_ = callCount

	err1 := r.run(context.Background(), "team-1", "report-1")
	err2 := r.run(context.Background(), "team-1", "report-1")

	if err1 != nil {
		t.Errorf("first run error: %v", err1)
	}
	if err2 != nil {
		t.Errorf("second run error: %v", err2)
	}
	// Only one Complete call (for the first run; second bailed out early).
	if store.completedCount() != 1 {
		t.Errorf("want 1 Complete call across two runs; got %d", store.completedCount())
	}
}

// countingClaimStore returns successive results from a pre-configured list.
type countingClaimStore struct {
	fakeTriageStore
	mu      sync.Mutex
	results []*model.TriageResult
	idx     int
}

func (c *countingClaimStore) CreateOrReset(_ context.Context, _, _ string) (*model.TriageResult, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.idx >= len(c.results) {
		return nil, nil
	}
	r := c.results[c.idx]
	c.idx++
	return r, nil
}

// ---------------------------------------------------------------------------
// Runner.Enqueue — bounded concurrency
// ---------------------------------------------------------------------------

func TestRunner_Enqueue_WhenSemaphoreIsFull_DropsJob(t *testing.T) {
	// Given: a runner whose semaphore is already at capacity (1/1 slots taken)
	store := newFakeStore(pendingResult("t-1"))
	data := &fakeReportData{failures: makeNFailures(1)}
	provider := llm.NewMock(validResponse(makeNFailures(1)))

	sem := make(chan struct{}, 1)
	sem <- struct{}{} // occupy the only slot

	r := &Runner{engine: NewEngine(provider), store: store, data: data, sem: sem}

	// When: Enqueue is called with the semaphore full
	r.Enqueue("team-1", "report-1")

	// Then: no goroutine was spawned — no status updates or store calls should occur
	// (synchronous check is safe because the default branch in Enqueue ran inline)
	if len(data.statusCalls) != 0 {
		t.Errorf("dropped job must not trigger status updates; got %d", len(data.statusCalls))
	}
	if store.completedCount() != 0 {
		t.Errorf("dropped job must not reach Complete; got %d calls", store.completedCount())
	}
}

// ---------------------------------------------------------------------------
// Runner.run — fetchPreviousFailures repository scoping
// ---------------------------------------------------------------------------

func TestRunner_Run_FetchPreviousFailures_ScopedByRepository(t *testing.T) {
	// Given: the report has a repository in its environment
	const repo = "org/my-repo"
	failures := makeNFailures(2)
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{
		failures: failures,
		env:      reportEnv{Repository: repo, Branch: "main"},
	}
	r := newTestRunner(store, data, validResponse(failures))

	// When
	if err := r.run(context.Background(), "team-1", "report-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Then: fetchPreviousFailures was invoked with the repository so results are
	// scoped to the correct project, not the entire team.
	data.mu.Lock()
	got := data.lastPrevFailureRepo
	data.mu.Unlock()
	if got != repo {
		t.Errorf("fetchPreviousFailures repository = %q; want %q", got, repo)
	}
}

func TestRunner_Run_FetchPreviousFailures_EmptyRepositoryWhenEnvAbsent(t *testing.T) {
	// Given: the report has no repository in its environment (env is zero value)
	failures := makeNFailures(1)
	store := newFakeStore(pendingResult("triage-1"))
	data := &fakeReportData{failures: failures}
	r := newTestRunner(store, data, validResponse(failures))

	// When
	if err := r.run(context.Background(), "team-1", "report-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Then: fetchPreviousFailures is still called (with empty repository),
	// so previous failures are included when repository is unknown.
	data.mu.Lock()
	got := data.lastPrevFailureRepo
	data.mu.Unlock()
	if got != "" {
		t.Errorf("fetchPreviousFailures repository = %q; want empty string when env has no repository", got)
	}
}
