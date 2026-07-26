package scaledtest

import (
	"context"
	"errors"
)

// ShardingService exposes the /api/v1/sharding endpoints.
type ShardingService struct {
	client *Client
}

// CreatePlan computes a shard plan for the given tests.
func (s *ShardingService) CreatePlan(ctx context.Context, req *CreateShardPlanRequest) (*ShardPlan, error) {
	if req == nil {
		return nil, errors.New("scaledtest: shard plan request is required")
	}
	if len(req.TestNames) == 0 {
		return nil, errors.New("scaledtest: test_names must not be empty")
	}
	if req.NumWorkers <= 0 {
		return nil, errors.New("scaledtest: num_workers must be positive")
	}
	var out ShardPlan
	if err := s.client.doAPI(ctx, "POST", "/sharding/plan", nil, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Rebalance redistributes tests from a failed worker to remaining workers.
func (s *ShardingService) Rebalance(ctx context.Context, req *RebalanceShardsRequest) (*ShardPlan, error) {
	if req == nil {
		return nil, errors.New("scaledtest: rebalance request is required")
	}
	if req.ExecutionID == "" {
		return nil, errMissingID("execution")
	}
	if req.FailedWorkerID == "" {
		return nil, errors.New("scaledtest: failed_worker_id is required")
	}
	var out ShardPlan
	if err := s.client.doAPI(ctx, "POST", "/sharding/rebalance", nil, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ListDurations returns historical duration data for the team, optionally
// filtered by suite.
func (s *ShardingService) ListDurations(ctx context.Context, suite string) (*ListShardDurationsResponse, error) {
	q := addQuery(nil, "suite", suite)
	var out ListShardDurationsResponse
	if err := s.client.doAPI(ctx, "GET", "/sharding/durations", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetDuration returns duration history entries for a single test name.
func (s *ShardingService) GetDuration(ctx context.Context, testName string) ([]TestDurationHistory, error) {
	if testName == "" {
		return nil, errors.New("scaledtest: test name is required")
	}
	var out []TestDurationHistory
	if err := s.client.doAPI(ctx, "GET", "/sharding/durations/"+pathEscape(testName), nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}
