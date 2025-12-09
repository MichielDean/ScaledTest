package handlers

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/middleware"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"go.uber.org/zap"
)

// SystemSettingsServiceHandler implements the Connect SystemSettingsService.
type SystemSettingsServiceHandler struct {
	settingsService services.SettingsManager
	logger          *zap.Logger
}

// NewSystemSettingsServiceHandler creates a new SystemSettingsServiceHandler.
func NewSystemSettingsServiceHandler(settingsService services.SettingsManager, logger *zap.Logger) *SystemSettingsServiceHandler {
	return &SystemSettingsServiceHandler{
		settingsService: settingsService,
		logger:          logger,
	}
}

// GetSettings retrieves all system settings (admin only).
func (h *SystemSettingsServiceHandler) GetSettings(
	ctx context.Context,
	req *connect.Request[pb.GetSettingsRequest],
) (*connect.Response[pb.SettingsResponse], error) {
	// Check admin role (should be done via interceptor, but double-check here)
	role, ok := ctx.Value(middleware.UserRoleKey).(string)
	if !ok || role != "admin" {
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("admin access required"))
	}

	settings, err := h.settingsService.GetSettings(ctx)
	if err != nil {
		h.logger.Error("Failed to get settings", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to retrieve settings"))
	}

	return connect.NewResponse(settingsToProtoConnect(settings)), nil
}

// UpdateSettings updates system settings (admin only).
func (h *SystemSettingsServiceHandler) UpdateSettings(
	ctx context.Context,
	req *connect.Request[pb.UpdateSettingsRequest],
) (*connect.Response[pb.SettingsResponse], error) {
	// Check admin role
	role, ok := ctx.Value(middleware.UserRoleKey).(string)
	if !ok || role != "admin" {
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("admin access required"))
	}

	// Convert proto request to model
	updateReq := protoToUpdateSettingsRequestConnect(req.Msg)

	settings, err := h.settingsService.UpdateSettings(ctx, updateReq)
	if err != nil {
		h.logger.Error("Failed to update settings", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to update settings"))
	}

	return connect.NewResponse(settingsToProtoConnect(settings)), nil
}

// GetPublicConfig returns non-sensitive configuration (public endpoint).
func (h *SystemSettingsServiceHandler) GetPublicConfig(
	ctx context.Context,
	req *connect.Request[pb.GetPublicConfigRequest],
) (*connect.Response[pb.PublicConfigResponse], error) {
	config, err := h.settingsService.GetPublicConfig(ctx)
	if err != nil {
		h.logger.Error("Failed to get public config", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to retrieve configuration"))
	}

	return connect.NewResponse(&pb.PublicConfigResponse{
		AppName:            config.AppName,
		ApiVersion:         config.APIVersion,
		ConfigCacheSeconds: int32(config.ConfigCacheSeconds),
		Version:            int32(config.Version),
	}), nil
}

// Conversion helpers for Connect handlers

func settingsToProtoConnect(settings *models.SystemSettings) *pb.SettingsResponse {
	if settings == nil {
		return nil
	}

	resp := &pb.SettingsResponse{
		Version: int32(settings.Version),
	}

	// Auth settings
	resp.Auth = &pb.AuthSettings{
		TokenExpiryHours:    int32(settings.Auth.TokenExpiryHours),
		JobTokenExpiryHours: int32(settings.Auth.JobTokenExpiryHours),
		AdminEmails:         settings.Auth.AdminEmails,
		FirstUserIsAdmin:    settings.Auth.FirstUserIsAdmin,
	}

	// CORS settings
	resp.Cors = &pb.CORSSettings{
		AllowedOrigins: settings.CORS.AllowedOrigins,
		AllowedMethods: settings.CORS.AllowedMethods,
		AllowedHeaders: settings.CORS.AllowedHeaders,
		MaxAgeSeconds:  int32(settings.CORS.MaxAgeSeconds),
	}

	// HTTP settings
	resp.Http = &pb.HTTPSettings{
		ReadTimeoutSeconds:  int32(settings.HTTP.ReadTimeoutSeconds),
		WriteTimeoutSeconds: int32(settings.HTTP.WriteTimeoutSeconds),
		IdleTimeoutSeconds:  int32(settings.HTTP.IdleTimeoutSeconds),
	}

	// Logging settings
	resp.Logging = &pb.LoggingSettings{
		Level:  settings.Logging.Level,
		Format: settings.Logging.Format,
	}

	// General settings
	resp.General = &pb.GeneralSettings{
		AppName:            settings.General.AppName,
		ApiVersion:         settings.General.APIVersion,
		ConfigCacheSeconds: int32(settings.General.ConfigCacheSeconds),
	}

	// Retention settings
	resp.Retention = &pb.RetentionSettings{
		ArtifactRetentionDays:   int32(settings.Retention.ArtifactRetentionDays),
		TestResultRetentionDays: int32(settings.Retention.TestResultRetentionDays),
		LogRetentionDays:        int32(settings.Retention.LogRetentionDays),
		CleanupEnabled:          settings.Retention.CleanupEnabled,
		CleanupHourUtc:          int32(settings.Retention.CleanupHourUTC),
	}

	return resp
}

func protoToUpdateSettingsRequestConnect(req *pb.UpdateSettingsRequest) *models.UpdateSettingsRequest {
	if req == nil {
		return nil
	}

	result := &models.UpdateSettingsRequest{}

	if req.Auth != nil {
		result.Auth = &models.AuthSettingsUpdate{}
		if req.Auth.TokenExpiryHours != nil {
			v := int(*req.Auth.TokenExpiryHours)
			result.Auth.TokenExpiryHours = &v
		}
		if req.Auth.JobTokenExpiryHours != nil {
			v := int(*req.Auth.JobTokenExpiryHours)
			result.Auth.JobTokenExpiryHours = &v
		}
		if len(req.Auth.AdminEmails) > 0 {
			result.Auth.AdminEmails = &req.Auth.AdminEmails
		}
		if req.Auth.FirstUserIsAdmin != nil {
			result.Auth.FirstUserIsAdmin = req.Auth.FirstUserIsAdmin
		}
	}

	if req.Cors != nil {
		result.CORS = &models.CORSSettingsUpdate{}
		if req.Cors.AllowedOrigins != nil {
			result.CORS.AllowedOrigins = req.Cors.AllowedOrigins
		}
		if req.Cors.AllowedMethods != nil {
			result.CORS.AllowedMethods = req.Cors.AllowedMethods
		}
		if req.Cors.AllowedHeaders != nil {
			result.CORS.AllowedHeaders = req.Cors.AllowedHeaders
		}
		if req.Cors.MaxAgeSeconds != nil {
			v := int(*req.Cors.MaxAgeSeconds)
			result.CORS.MaxAgeSeconds = &v
		}
	}

	if req.Http != nil {
		result.HTTP = &models.HTTPSettingsUpdate{}
		if req.Http.ReadTimeoutSeconds != nil {
			v := int(*req.Http.ReadTimeoutSeconds)
			result.HTTP.ReadTimeoutSeconds = &v
		}
		if req.Http.WriteTimeoutSeconds != nil {
			v := int(*req.Http.WriteTimeoutSeconds)
			result.HTTP.WriteTimeoutSeconds = &v
		}
		if req.Http.IdleTimeoutSeconds != nil {
			v := int(*req.Http.IdleTimeoutSeconds)
			result.HTTP.IdleTimeoutSeconds = &v
		}
	}

	if req.Logging != nil {
		result.Logging = &models.LoggingSettingsUpdate{}
		if req.Logging.Level != nil {
			result.Logging.Level = req.Logging.Level
		}
		if req.Logging.Format != nil {
			result.Logging.Format = req.Logging.Format
		}
	}

	if req.General != nil {
		result.General = &models.GeneralSettingsUpdate{}
		if req.General.AppName != nil {
			result.General.AppName = req.General.AppName
		}
		// Note: APIVersion is not editable via settings update
		if req.General.ConfigCacheSeconds != nil {
			v := int(*req.General.ConfigCacheSeconds)
			result.General.ConfigCacheSeconds = &v
		}
	}

	if req.Retention != nil {
		result.Retention = &models.RetentionSettingsUpdate{}
		if req.Retention.ArtifactRetentionDays != nil {
			v := int(*req.Retention.ArtifactRetentionDays)
			result.Retention.ArtifactRetentionDays = &v
		}
		if req.Retention.TestResultRetentionDays != nil {
			v := int(*req.Retention.TestResultRetentionDays)
			result.Retention.TestResultRetentionDays = &v
		}
		if req.Retention.LogRetentionDays != nil {
			v := int(*req.Retention.LogRetentionDays)
			result.Retention.LogRetentionDays = &v
		}
		if req.Retention.CleanupEnabled != nil {
			result.Retention.CleanupEnabled = req.Retention.CleanupEnabled
		}
		if req.Retention.CleanupHourUtc != nil {
			v := int(*req.Retention.CleanupHourUtc)
			result.Retention.CleanupHourUTC = &v
		}
	}

	return result
}
