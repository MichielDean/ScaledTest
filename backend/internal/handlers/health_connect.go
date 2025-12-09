package handlers

import (
	"context"
	"time"

	"connectrpc.com/connect"
	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// HealthServiceHandler implements the Connect HealthService.
type HealthServiceHandler struct {
	dbChecker   services.DatabaseHealthChecker
	logger      *zap.Logger
	environment string
}

// NewHealthServiceHandler creates a new HealthServiceHandler.
func NewHealthServiceHandler(dbChecker services.DatabaseHealthChecker, logger *zap.Logger, environment string) *HealthServiceHandler {
	return &HealthServiceHandler{
		dbChecker:   dbChecker,
		logger:      logger,
		environment: environment,
	}
}

// Check performs a health check.
func (h *HealthServiceHandler) Check(
	ctx context.Context,
	req *connect.Request[pb.HealthCheckRequest],
) (*connect.Response[pb.HealthCheckResponse], error) {
	response := &pb.HealthCheckResponse{
		Status:      pb.ServingStatus_SERVING_STATUS_SERVING,
		Environment: h.environment,
		Timestamp:   timestamppb.Now(),
		Components:  make(map[string]*pb.ComponentHealth),
	}

	// Check database health
	dbStart := time.Now()
	dbErr := h.dbChecker.Health(ctx)
	dbLatency := time.Since(dbStart).Milliseconds()

	if dbErr != nil {
		response.Status = pb.ServingStatus_SERVING_STATUS_NOT_SERVING
		errMsg := dbErr.Error()
		response.Components["database"] = &pb.ComponentHealth{
			Status:    pb.ServingStatus_SERVING_STATUS_NOT_SERVING,
			Message:   &errMsg,
			LatencyMs: &dbLatency,
		}
	} else {
		okMsg := "database connection healthy"
		response.Components["database"] = &pb.ComponentHealth{
			Status:    pb.ServingStatus_SERVING_STATUS_SERVING,
			Message:   &okMsg,
			LatencyMs: &dbLatency,
		}
	}

	// Check specific service if requested
	if req.Msg.Service != "" {
		switch req.Msg.Service {
		case "database":
			// Already checked above
		default:
			// Unknown service - still return overall health
		}
	}

	return connect.NewResponse(response), nil
}

// Ready checks if the application is ready to serve traffic.
// This is used by Kubernetes readiness probes.
func (h *HealthServiceHandler) Ready(
	ctx context.Context,
	req *connect.Request[pb.ReadyRequest],
) (*connect.Response[pb.ReadyResponse], error) {
	// Check database connectivity for readiness
	ready := true
	message := "service ready"

	if err := h.dbChecker.Health(ctx); err != nil {
		ready = false
		message = "database not ready: " + err.Error()
	}

	return connect.NewResponse(&pb.ReadyResponse{
		Ready:   ready,
		Message: message,
	}), nil
}

// Live checks if the application is alive.
// This is used by Kubernetes liveness probes.
func (h *HealthServiceHandler) Live(
	ctx context.Context,
	req *connect.Request[pb.LiveRequest],
) (*connect.Response[pb.LiveResponse], error) {
	// Liveness check is simple - if we can respond, we're alive
	return connect.NewResponse(&pb.LiveResponse{
		Alive:   true,
		Message: "service alive",
	}), nil
}

// Watch streams health status changes (for health checking systems).
// Note: This is a server-streaming RPC.
func (h *HealthServiceHandler) Watch(
	ctx context.Context,
	req *connect.Request[pb.HealthCheckRequest],
	stream *connect.ServerStream[pb.HealthCheckResponse],
) error {
	// Initial health check
	response, err := h.checkHealth(ctx, req.Msg)
	if err != nil {
		return err
	}

	if err := stream.Send(response); err != nil {
		return err
	}

	// Continue streaming health updates until client disconnects
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			response, err := h.checkHealth(ctx, req.Msg)
			if err != nil {
				h.logger.Error("Health check failed during watch", zap.Error(err))
				continue
			}
			if err := stream.Send(response); err != nil {
				return err
			}
		}
	}
}

// checkHealth performs a health check and returns the response.
func (h *HealthServiceHandler) checkHealth(ctx context.Context, req *pb.HealthCheckRequest) (*pb.HealthCheckResponse, error) {
	response := &pb.HealthCheckResponse{
		Status:      pb.ServingStatus_SERVING_STATUS_SERVING,
		Environment: h.environment,
		Timestamp:   timestamppb.Now(),
		Components:  make(map[string]*pb.ComponentHealth),
	}

	// Check database health
	dbStart := time.Now()
	dbErr := h.dbChecker.Health(ctx)
	dbLatency := time.Since(dbStart).Milliseconds()

	if dbErr != nil {
		response.Status = pb.ServingStatus_SERVING_STATUS_NOT_SERVING
		errMsg := dbErr.Error()
		response.Components["database"] = &pb.ComponentHealth{
			Status:    pb.ServingStatus_SERVING_STATUS_NOT_SERVING,
			Message:   &errMsg,
			LatencyMs: &dbLatency,
		}
	} else {
		okMsg := "database connection healthy"
		response.Components["database"] = &pb.ComponentHealth{
			Status:    pb.ServingStatus_SERVING_STATUS_SERVING,
			Message:   &okMsg,
			LatencyMs: &dbLatency,
		}
	}

	return response, nil
}
