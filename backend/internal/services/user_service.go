package services

import (
	"context"
	"strings"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/repository"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// UserService implements the gRPC UserService.
// It implements the UserManager interface.
type UserService struct {
	proto.UnimplementedUserServiceServer
	repo   repository.UserRepository
	logger *zap.Logger
}

// NewUserService creates a new UserService with injected dependencies.
func NewUserService(repo repository.UserRepository, logger *zap.Logger) *UserService {
	return &UserService{
		repo:   repo,
		logger: logger,
	}
}

// GetUserProfile retrieves a user profile by ID
func (s *UserService) GetUserProfile(ctx context.Context, req *proto.GetUserProfileRequest) (*proto.UserProfileResponse, error) {
	s.logger.Info("Getting user profile", zap.String("user_id", req.UserId))

	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	user, err := s.repo.GetUserWithRole(ctx, req.UserId)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, status.Error(codes.NotFound, "user not found")
		}
		s.logger.Error("Failed to get user", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to retrieve user profile")
	}

	response := &proto.UserProfileResponse{
		Id:    user.ID,
		Email: user.Email,
		Name:  user.Name,
		Role:  string(user.Role),
	}

	if !user.CreatedAt.IsZero() {
		response.CreatedAt = timestamppb.New(user.CreatedAt)
	}
	if !user.UpdatedAt.IsZero() {
		response.UpdatedAt = timestamppb.New(user.UpdatedAt)
	}

	return response, nil
}

// UpdateUserProfile updates a user's profile information
func (s *UserService) UpdateUserProfile(ctx context.Context, req *proto.UpdateUserProfileRequest) (*proto.UserProfileResponse, error) {
	s.logger.Info("Updating user profile",
		zap.String("user_id", req.UserId),
		zap.Bool("has_name", req.Name != nil),
		zap.Bool("has_avatar", req.AvatarUrl != nil),
	)

	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	// Get existing profile
	profile, err := s.repo.GetProfileByID(ctx, req.UserId)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, status.Error(codes.NotFound, "user not found")
		}
		s.logger.Error("Failed to get profile", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to retrieve user profile")
	}

	// Apply updates
	if req.Name != nil {
		profile.Name = *req.Name
	}
	if req.AvatarUrl != nil {
		profile.AvatarURL = req.AvatarUrl
	}

	// Save updated profile
	if err := s.repo.UpdateProfile(ctx, profile); err != nil {
		s.logger.Error("Failed to update profile", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to update user profile")
	}

	// Return updated profile
	return s.GetUserProfile(ctx, &proto.GetUserProfileRequest{UserId: req.UserId})
}

// ListUsers lists all users with pagination and filtering (admin only)
func (s *UserService) ListUsers(ctx context.Context, req *proto.ListUsersRequest) (*proto.ListUsersResponse, error) {
	s.logger.Info("Listing users",
		zap.Int32("page", req.Page),
		zap.Int32("page_size", req.PageSize),
		zap.String("search", req.GetSearch()),
	)

	// Set defaults
	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Build options
	opts := repository.ListUsersOptions{
		Page:     page,
		PageSize: pageSize,
	}
	if req.Search != nil {
		opts.Search = *req.Search
	}
	if req.RoleFilter != nil {
		opts.RoleFilter = *req.RoleFilter
	}

	// Call repository
	users, totalCount, err := s.repo.ListUsers(ctx, opts)
	if err != nil {
		s.logger.Error("Failed to list users", zap.Error(err))
		return nil, status.Error(codes.Internal, "failed to list users")
	}

	// Convert to proto responses
	protoUsers := make([]*proto.UserProfileResponse, 0, len(users))
	for _, user := range users {
		protoUser := &proto.UserProfileResponse{
			Id:    user.ID,
			Email: user.Email,
			Name:  user.Name,
			Role:  string(user.Role),
		}

		if !user.CreatedAt.IsZero() {
			protoUser.CreatedAt = timestamppb.New(user.CreatedAt)
		}
		if !user.UpdatedAt.IsZero() {
			protoUser.UpdatedAt = timestamppb.New(user.UpdatedAt)
		}

		protoUsers = append(protoUsers, protoUser)
	}

	return &proto.ListUsersResponse{
		Users:      protoUsers,
		TotalCount: totalCount,
		Page:       page,
		PageSize:   pageSize,
	}, nil
}

// REST-compatible methods for HTTP handlers

// GetUserByID retrieves a user with their role by ID
func (s *UserService) GetUserByID(ctx context.Context, userID string) (*models.User, error) {
	s.logger.Debug("Getting user by ID", zap.String("user_id", userID))

	user, err := s.repo.GetUserWithRole(ctx, userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, err
		}
		s.logger.Error("Failed to get user", zap.Error(err), zap.String("user_id", userID))
		return nil, err
	}

	return user, nil
}

// GetProfileByID retrieves a user profile by ID
func (s *UserService) GetProfileByID(ctx context.Context, userID string) (*models.Profile, error) {
	s.logger.Debug("Getting profile by ID", zap.String("user_id", userID))

	profile, err := s.repo.GetProfileByID(ctx, userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, err
		}
		s.logger.Error("Failed to get profile", zap.Error(err), zap.String("user_id", userID))
		return nil, err
	}

	return profile, nil
}

// UpdateProfile updates a user's profile
func (s *UserService) UpdateProfile(ctx context.Context, profile *models.Profile) error {
	s.logger.Info("Updating profile", zap.String("user_id", profile.ID))

	if err := s.repo.UpdateProfile(ctx, profile); err != nil {
		s.logger.Error("Failed to update profile", zap.Error(err), zap.String("user_id", profile.ID))
		return err
	}

	return nil
}

// ListUsersREST lists users with pagination for REST API
func (s *UserService) ListUsersREST(ctx context.Context, page, pageSize int32, search, roleFilter string) ([]*models.User, int32, error) {
	s.logger.Debug("Listing users via REST",
		zap.Int32("page", page),
		zap.Int32("page_size", pageSize),
	)

	opts := repository.ListUsersOptions{
		Page:       page,
		PageSize:   pageSize,
		Search:     search,
		RoleFilter: roleFilter,
	}

	users, totalCount, err := s.repo.ListUsers(ctx, opts)
	if err != nil {
		s.logger.Error("Failed to list users", zap.Error(err))
		return nil, 0, err
	}

	return users, totalCount, nil
}
