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
	"google.golang.org/protobuf/types/known/timestamppb"
)

// AuthServiceHandler implements the Connect AuthService.
type AuthServiceHandler struct {
	authService services.AuthManager
	logger      *zap.Logger
}

// NewAuthServiceHandler creates a new AuthServiceHandler.
func NewAuthServiceHandler(authService services.AuthManager, logger *zap.Logger) *AuthServiceHandler {
	return &AuthServiceHandler{
		authService: authService,
		logger:      logger,
	}
}

// Signup creates a new user account.
func (h *AuthServiceHandler) Signup(
	ctx context.Context,
	req *connect.Request[pb.SignupRequest],
) (*connect.Response[pb.AuthResponse], error) {
	if req.Msg.Email == "" || req.Msg.Password == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("email and password are required"))
	}

	result, err := h.authService.Signup(ctx, req.Msg.Email, req.Msg.Password, req.Msg.Name)
	if err != nil {
		h.logger.Error("Signup failed", zap.Error(err), zap.String("email", req.Msg.Email))
		return nil, mapAuthErrorToConnect(err)
	}

	return connect.NewResponse(&pb.AuthResponse{
		AccessToken: result.AccessToken,
		TokenType:   result.TokenType,
		ExpiresIn:   result.ExpiresIn,
		User: &pb.UserInfo{
			Id:    result.User.ID,
			Email: result.User.Email,
			Name:  result.User.Name,
			Role:  string(result.User.Role),
		},
	}), nil
}

// Login authenticates a user and returns a JWT token.
func (h *AuthServiceHandler) Login(
	ctx context.Context,
	req *connect.Request[pb.LoginRequest],
) (*connect.Response[pb.AuthResponse], error) {
	if req.Msg.Email == "" || req.Msg.Password == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("email and password are required"))
	}

	result, err := h.authService.Login(ctx, req.Msg.Email, req.Msg.Password)
	if err != nil {
		h.logger.Warn("Login failed", zap.Error(err), zap.String("email", req.Msg.Email))
		return nil, mapAuthErrorToConnect(err)
	}

	return connect.NewResponse(&pb.AuthResponse{
		AccessToken: result.AccessToken,
		TokenType:   result.TokenType,
		ExpiresIn:   result.ExpiresIn,
		User: &pb.UserInfo{
			Id:    result.User.ID,
			Email: result.User.Email,
			Name:  result.User.Name,
			Role:  string(result.User.Role),
		},
	}), nil
}

// Logout invalidates the current session.
func (h *AuthServiceHandler) Logout(
	ctx context.Context,
	req *connect.Request[pb.LogoutRequest],
) (*connect.Response[pb.LogoutResponse], error) {
	// For JWT-based auth, logout is typically handled client-side by discarding the token.
	// We could implement token blacklisting here if needed in the future.
	return connect.NewResponse(&pb.LogoutResponse{
		Message: "Logged out successfully",
	}), nil
}

// GetCurrentUser returns the currently authenticated user.
func (h *AuthServiceHandler) GetCurrentUser(
	ctx context.Context,
	req *connect.Request[pb.GetCurrentUserRequest],
) (*connect.Response[pb.UserResponse], error) {
	// Get user ID from context (set by auth interceptor)
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	user, err := h.authService.GetUser(ctx, userID)
	if err != nil {
		h.logger.Error("Failed to get user", zap.Error(err), zap.String("user_id", userID))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to get user"))
	}

	return connect.NewResponse(&pb.UserResponse{
		Id:            user.ID,
		Email:         user.Email,
		Name:          user.Name,
		Role:          string(user.Role),
		EmailVerified: user.EmailVerified,
		CreatedAt:     timestamppb.New(user.CreatedAt),
		UpdatedAt:     timestamppb.New(user.UpdatedAt),
	}), nil
}

// RefreshToken refreshes an expired JWT token.
func (h *AuthServiceHandler) RefreshToken(
	ctx context.Context,
	req *connect.Request[pb.RefreshTokenRequest],
) (*connect.Response[pb.AuthResponse], error) {
	// TODO: Implement token refresh logic
	// For now, return unimplemented
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("token refresh not yet implemented"))
}

// mapAuthErrorToConnect converts service errors to Connect errors.
func mapAuthErrorToConnect(err error) error {
	errMsg := err.Error()

	switch {
	case strings.Contains(errMsg, "email and password are required"):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case strings.Contains(errMsg, "email already exists"):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case strings.Contains(errMsg, "invalid email or password"):
		return connect.NewError(connect.CodeUnauthenticated, err)
	case strings.Contains(errMsg, "not found"):
		return connect.NewError(connect.CodeNotFound, errors.New("user not found"))
	default:
		return connect.NewError(connect.CodeInternal, errors.New("internal server error"))
	}
}
