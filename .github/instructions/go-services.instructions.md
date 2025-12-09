---
applyTo: "backend/internal/services/**/*.go"
---

# Go Service Standards

Guidelines for business logic layer in ScaledTest. Services depend on repository interfaces.

---

## Service Structure

**Interface in `interfaces.go`:**
```go
// services/interfaces.go
type UserManager interface {
    GetUser(ctx context.Context, id string) (*models.User, error)
    CreateUser(ctx context.Context, req CreateUserRequest) (*models.User, error)
    UpdateUser(ctx context.Context, id string, req UpdateUserRequest) (*models.User, error)
}
```

**Implementation with DI:**
```go
type UserService struct {
    proto.UnimplementedUserServiceServer  // Embed for gRPC forward compatibility
    repo   repository.UserRepository      // Interface, not concrete type
    logger *zap.Logger
}

func NewUserService(repo repository.UserRepository, logger *zap.Logger) *UserService {
    return &UserService{repo: repo, logger: logger}
}
```

---

## Dependency Injection with Wire

**Provider set pattern:**
```go
// wire/wire.go
//go:build wireinject

var RepositorySet = wire.NewSet(
    repository.NewPostgresUserRepository,
    wire.Bind(new(repository.UserRepository), new(*repository.PostgresUserRepository)),
)

var ServiceSet = wire.NewSet(
    services.NewUserService,
    wire.Bind(new(services.UserManager), new(*services.UserService)),
)
```

**Run Wire:** `cd backend && wire ./internal/wire`

---

## gRPC Implementation

**Embed Unimplemented server for forward compatibility:**
```go
type UserService struct {
    proto.UnimplementedUserServiceServer
    // ... fields
}

func (s *UserService) GetUser(ctx context.Context, req *proto.GetUserRequest) (*proto.GetUserResponse, error) {
    user, err := s.repo.GetByID(ctx, req.GetUserId())
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to get user: %v", err)
    }
    if user == nil {
        return nil, status.Error(codes.NotFound, "user not found")
    }
    return &proto.GetUserResponse{User: toProtoUser(user)}, nil
}
```

---

## Authentication

**JWT token generation:**
```go
import "github.com/golang-jwt/jwt/v5"

func (s *AuthService) GenerateToken(user *models.User) (string, error) {
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
        "user_id": user.ID,
        "email":   user.Email,
        "role":    user.Role,
        "exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
    })

    tokenString, err := token.SignedString([]byte(s.jwtSecret))
    if err != nil {
        return "", fmt.Errorf("sign token: %w", err)
    }
    return tokenString, nil
}
```

**Password hashing with bcrypt:**
```go
import "golang.org/x/crypto/bcrypt"

func HashPassword(password string) (string, error) {
    hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        return "", fmt.Errorf("hash password: %w", err)
    }
    return string(hash), nil
}

func VerifyPassword(hash, password string) error {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
```

---

## Business Logic Patterns

**Validation before persistence:**
```go
func (s *UserService) CreateUser(ctx context.Context, req CreateUserRequest) (*models.User, error) {
    // Validate
    if req.Email == "" {
        return nil, ErrEmailRequired
    }

    // Check uniqueness
    existing, _ := s.repo.GetByEmail(ctx, req.Email)
    if existing != nil {
        return nil, ErrEmailExists
    }

    // Create
    user := &models.User{
        ID:    uuid.New().String(),
        Email: req.Email,
        Name:  req.Name,
    }

    if err := s.repo.Create(ctx, user); err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }

    s.logger.Info("User created", zap.String("userId", user.ID))
    return user, nil
}
```

---

## Architecture Constraints

- Services MUST depend on repository interfaces, not concrete types
- Services MUST NOT import `handlers` package
- Maximum function size: 80 lines
