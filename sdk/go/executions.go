package scaledtest

import (
	"context"
	"errors"
	"net/url"
)

// ExecutionsService exposes the /api/v1/executions endpoints.
type ExecutionsService struct {
	client *Client
}

// ListExecutionsParams filters the Executions.List result set.
type ListExecutionsParams struct {
	Limit  int
	Offset int
}

// CreateExecutionOptions carries optional fields for Create.
type CreateExecutionOptions struct {
	Image   string
	EnvVars map[string]string
}

// List retrieves a paginated list of executions for the caller's team.
func (s *ExecutionsService) List(ctx context.Context, p *ListExecutionsParams) (*ListExecutionsResponse, error) {
	var q url.Values
	if p != nil {
		q = addInt(q, "limit", p.Limit)
		q = addInt(q, "offset", p.Offset)
	}
	var out ListExecutionsResponse
	if err := s.client.doAPI(ctx, "GET", "/executions", q, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Create starts a new test execution.
func (s *ExecutionsService) Create(ctx context.Context, command string, opts *CreateExecutionOptions) (*CreateExecutionResponse, error) {
	if command == "" {
		return nil, errors.New("scaledtest: command is required")
	}
	body := map[string]interface{}{"command": command}
	if opts != nil {
		if opts.Image != "" {
			body["image"] = opts.Image
		}
		if len(opts.EnvVars) > 0 {
			body["env_vars"] = opts.EnvVars
		}
	}
	var out CreateExecutionResponse
	if err := s.client.doAPI(ctx, "POST", "/executions", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get retrieves a single execution by ID.
func (s *ExecutionsService) Get(ctx context.Context, id string) (*Execution, error) {
	if id == "" {
		return nil, errMissingID("execution")
	}
	var out Execution
	if err := s.client.doAPI(ctx, "GET", "/executions/"+pathEscape(id), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Cancel cancels (and deletes the K8s job for) an execution. It is an alias
// for Delete on the underlying endpoint.
func (s *ExecutionsService) Cancel(ctx context.Context, id string) (*CancelExecutionResponse, error) {
	if id == "" {
		return nil, errMissingID("execution")
	}
	var out CancelExecutionResponse
	if err := s.client.doAPI(ctx, "DELETE", "/executions/"+pathEscape(id), nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Delete is an alias for Cancel.
func (s *ExecutionsService) Delete(ctx context.Context, id string) (*CancelExecutionResponse, error) {
	return s.Cancel(ctx, id)
}

// UpdateStatus updates the lifecycle status of an execution (worker callback).
func (s *ExecutionsService) UpdateStatus(ctx context.Context, id string, status UpdateExecutionStatus, errorMsg string) (*UpdateExecutionStatusResponse, error) {
	if id == "" {
		return nil, errMissingID("execution")
	}
	body := map[string]interface{}{"status": string(status)}
	if errorMsg != "" {
		body["error_msg"] = errorMsg
	}
	var out UpdateExecutionStatusResponse
	if err := s.client.doAPI(ctx, "PUT", "/executions/"+pathEscape(id)+"/status", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ReportProgress streams live test counters for an execution (worker callback).
func (s *ExecutionsService) ReportProgress(ctx context.Context, id string, progress *ExecutionProgress) (*ExecutionProgressResponse, error) {
	if id == "" {
		return nil, errMissingID("execution")
	}
	if progress == nil {
		return nil, errors.New("scaledtest: progress is required")
	}
	var out ExecutionProgressResponse
	if err := s.client.doAPI(ctx, "POST", "/executions/"+pathEscape(id)+"/progress", nil, progress, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ReportTestResult streams a single test result for an execution (worker callback).
func (s *ExecutionsService) ReportTestResult(ctx context.Context, id string, result *TestResultEvent) (*ExecutionReceivedResponse, error) {
	if id == "" {
		return nil, errMissingID("execution")
	}
	if result == nil {
		return nil, errors.New("scaledtest: test result is required")
	}
	var out ExecutionReceivedResponse
	if err := s.client.doAPI(ctx, "POST", "/executions/"+pathEscape(id)+"/test-result", nil, result, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ReportWorkerStatus streams worker health for an execution (worker callback).
func (s *ExecutionsService) ReportWorkerStatus(ctx context.Context, id string, status *WorkerStatusEvent) (*ExecutionReceivedResponse, error) {
	if id == "" {
		return nil, errMissingID("execution")
	}
	if status == nil {
		return nil, errors.New("scaledtest: worker status is required")
	}
	var out ExecutionReceivedResponse
	if err := s.client.doAPI(ctx, "POST", "/executions/"+pathEscape(id)+"/worker-status", nil, status, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
