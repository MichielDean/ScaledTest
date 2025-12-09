package handlers

import (
	"context"
	"errors"
	"strings"

	"connectrpc.com/connect"
	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/middleware"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// UserServiceHandler implements the Connect UserService.
type UserServiceHandler struct {
	userService services.UserManager
	logger      *zap.Logger
}

// NewUserServiceHandler creates a new UserServiceHandler.
func NewUserServiceHandler(userService services.UserManager, logger *zap.Logger) *UserServiceHandler {
	return &UserServiceHandler{
		userService: userService,
		logger:      logger,
	}
}

// GetUserProfile retrieves a user's profile by ID.
func (h *UserServiceHandler) GetUserProfile(
	ctx context.Context,
	req *connect.Request[pb.GetUserProfileRequest],
) (*connect.Response[pb.UserProfileResponse], error) {
	// Get authenticated user from context for authorization check
	authUserID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || authUserID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}
	authRole, _ := ctx.Value(middleware.UserRoleKey).(string)

	// Check authorization: user can only access their own profile unless admin
	userID := req.Msg.UserId
	if userID != "" && authUserID != userID && authRole != "admin" {
		h.logger.Info("Unauthorized profile access attempt",
			zap.String("authUserId", authUserID),
			zap.String("requestedUserId", userID),
		)
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("access denied"))
	}

	// Delegate to the service which returns proto response
	resp, err := h.userService.GetUserProfile(ctx, req.Msg)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(resp), nil
}

// UpdateUserProfile updates a user's profile.
func (h *UserServiceHandler) UpdateUserProfile(
	ctx context.Context,
	req *connect.Request[pb.UpdateUserProfileRequest],
) (*connect.Response[pb.UserProfileResponse], error) {
	// Get authenticated user from context
	authUserID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || authUserID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	// Check authorization: user can only update their own profile
	userID := req.Msg.UserId
	if userID != "" && authUserID != userID {
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("access denied"))
	}

	// Delegate to the service
	resp, err := h.userService.UpdateUserProfile(ctx, req.Msg)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(resp), nil
}

// ListUsers lists all users (admin only).
func (h *UserServiceHandler) ListUsers(
	ctx context.Context,
	req *connect.Request[pb.ListUsersRequest],
) (*connect.Response[pb.ListUsersResponse], error) {
	// Get authenticated user from context
	_, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}
	authRole, _ := ctx.Value(middleware.UserRoleKey).(string)

	// Check authorization: only admin can list users
	if authRole != "admin" {
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("admin access required"))
	}

	// Delegate to the service
	resp, err := h.userService.ListUsers(ctx, req.Msg)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(resp), nil
}

// mapGrpcErrorToConnect converts gRPC status errors to Connect errors.
func mapGrpcErrorToConnect(err error) error {
	if err == nil {
		return nil
	}

	// Try to extract gRPC status
	if st, ok := status.FromError(err); ok {
		var connectCode connect.Code
		switch st.Code() {
		case codes.InvalidArgument:
			connectCode = connect.CodeInvalidArgument
		case codes.NotFound:
			connectCode = connect.CodeNotFound
		case codes.AlreadyExists:
			connectCode = connect.CodeAlreadyExists
		case codes.PermissionDenied:
			connectCode = connect.CodePermissionDenied
		case codes.Unauthenticated:
			connectCode = connect.CodeUnauthenticated
		case codes.Unimplemented:
			connectCode = connect.CodeUnimplemented
		case codes.Unavailable:
			connectCode = connect.CodeUnavailable
		default:
			connectCode = connect.CodeInternal
		}
		return connect.NewError(connectCode, errors.New(st.Message()))
	}

	// Fallback: check common error messages
	errMsg := err.Error()
	switch {
	case strings.Contains(errMsg, "not found"):
		return connect.NewError(connect.CodeNotFound, err)
	case strings.Contains(errMsg, "invalid"):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case strings.Contains(errMsg, "unauthorized") || strings.Contains(errMsg, "unauthenticated"):
		return connect.NewError(connect.CodeUnauthenticated, err)
	case strings.Contains(errMsg, "permission denied") || strings.Contains(errMsg, "access denied"):
		return connect.NewError(connect.CodePermissionDenied, err)
	default:
		return connect.NewError(connect.CodeInternal, errors.New("internal server error"))
	}
}
