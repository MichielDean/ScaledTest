package middleware

import (
	"context"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// AuthClaims represents the validated claims from a JWT token.
type AuthClaims struct {
	UserID     string
	Role       string
	TokenType  string
	ProjectID  string
	K8sJobName string
}

// ValidateToken parses and validates a JWT token, returning the extracted claims.
// This is shared between HTTP and gRPC authentication.
func ValidateToken(tokenString, jwtSecret string) (*AuthClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(jwtSecret), nil
	})

	if err != nil || !token.Valid {
		return nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, jwt.ErrTokenMalformed
	}

	authClaims := &AuthClaims{}

	// Check token type
	tokenType, _ := claims["type"].(string)
	if tokenType == "job_token" {
		authClaims.TokenType = "job_token"
		authClaims.ProjectID, _ = claims["project_id"].(string)
		authClaims.K8sJobName, _ = claims["k8s_job_name"].(string)

		if authClaims.ProjectID == "" || authClaims.K8sJobName == "" {
			return nil, jwt.ErrTokenMalformed
		}

		authClaims.UserID = "job-" + authClaims.K8sJobName
		authClaims.Role = "job"
	} else {
		authClaims.TokenType = "user_token"
		userID, ok := claims["sub"].(string)
		if !ok || userID == "" {
			return nil, jwt.ErrTokenMalformed
		}
		authClaims.UserID = userID

		role, _ := claims["role"].(string)
		if role == "" {
			role = "user"
		}
		authClaims.Role = role
	}

	return authClaims, nil
}

// ContextWithAuthClaims adds authentication claims to a context.
func ContextWithAuthClaims(ctx context.Context, claims *AuthClaims) context.Context {
	ctx = context.WithValue(ctx, UserIDKey, claims.UserID)
	ctx = context.WithValue(ctx, UserRoleKey, claims.Role)
	ctx = context.WithValue(ctx, TokenTypeKey, claims.TokenType)
	if claims.ProjectID != "" {
		ctx = context.WithValue(ctx, ProjectIDKey, claims.ProjectID)
	}
	if claims.K8sJobName != "" {
		ctx = context.WithValue(ctx, K8sJobNameKey, claims.K8sJobName)
	}
	return ctx
}

// extractTokenFromMetadata extracts the Bearer token from gRPC metadata.
func extractTokenFromMetadata(md metadata.MD) string {
	values := md.Get("authorization")
	if len(values) == 0 {
		return ""
	}
	return strings.TrimPrefix(values[0], "Bearer ")
}

// UnaryAuthInterceptor creates a gRPC unary interceptor for JWT authentication.
func UnaryAuthInterceptor(jwtSecret string, logger *zap.Logger) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			logger.Debug("Missing metadata in gRPC request",
				zap.String("method", info.FullMethod),
			)
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}

		tokenString := extractTokenFromMetadata(md)
		if tokenString == "" {
			logger.Debug("Missing authorization token in gRPC request",
				zap.String("method", info.FullMethod),
			)
			return nil, status.Error(codes.Unauthenticated, "missing authorization token")
		}

		claims, err := ValidateToken(tokenString, jwtSecret)
		if err != nil {
			logger.Debug("Invalid token in gRPC request",
				zap.String("method", info.FullMethod),
				zap.Error(err),
			)
			return nil, status.Error(codes.Unauthenticated, "invalid or expired token")
		}

		logger.Debug("gRPC request authenticated",
			zap.String("method", info.FullMethod),
			zap.String("user_id", claims.UserID),
			zap.String("role", claims.Role),
		)

		ctx = ContextWithAuthClaims(ctx, claims)
		return handler(ctx, req)
	}
}

// StreamAuthInterceptor creates a gRPC stream interceptor for JWT authentication.
func StreamAuthInterceptor(jwtSecret string, logger *zap.Logger) grpc.StreamServerInterceptor {
	return func(
		srv interface{},
		ss grpc.ServerStream,
		info *grpc.StreamServerInfo,
		handler grpc.StreamHandler,
	) error {
		ctx := ss.Context()
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			logger.Debug("Missing metadata in gRPC stream",
				zap.String("method", info.FullMethod),
			)
			return status.Error(codes.Unauthenticated, "missing metadata")
		}

		tokenString := extractTokenFromMetadata(md)
		if tokenString == "" {
			logger.Debug("Missing authorization token in gRPC stream",
				zap.String("method", info.FullMethod),
			)
			return status.Error(codes.Unauthenticated, "missing authorization token")
		}

		claims, err := ValidateToken(tokenString, jwtSecret)
		if err != nil {
			logger.Debug("Invalid token in gRPC stream",
				zap.String("method", info.FullMethod),
				zap.Error(err),
			)
			return status.Error(codes.Unauthenticated, "invalid or expired token")
		}

		logger.Debug("gRPC stream authenticated",
			zap.String("method", info.FullMethod),
			zap.String("user_id", claims.UserID),
			zap.String("role", claims.Role),
		)

		wrapped := &authenticatedServerStream{
			ServerStream: ss,
			ctx:          ContextWithAuthClaims(ctx, claims),
		}
		return handler(srv, wrapped)
	}
}

// authenticatedServerStream wraps a gRPC ServerStream with an authenticated context.
type authenticatedServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *authenticatedServerStream) Context() context.Context {
	return s.ctx
}

// GetUserRoleFromContext extracts user role from standard context (for gRPC).
func GetUserRoleFromContext(ctx context.Context) string {
	if role, ok := ctx.Value(UserRoleKey).(string); ok {
		return role
	}
	return "user"
}

// GetProjectIDFromContext extracts project ID from context (for job tokens).
func GetProjectIDFromContext(ctx context.Context) string {
	if projectID, ok := ctx.Value(ProjectIDKey).(string); ok {
		return projectID
	}
	return ""
}

// GetK8sJobNameFromContext extracts K8s job name from context (for job tokens).
func GetK8sJobNameFromContext(ctx context.Context) string {
	if jobName, ok := ctx.Value(K8sJobNameKey).(string); ok {
		return jobName
	}
	return ""
}
