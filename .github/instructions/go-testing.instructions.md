---
applyTo: "backend/**/*_test.go"
---

# Go Testing Standards

Guidelines for test files in ScaledTest backend.

---

## Table-Driven Tests

**Standard structure:**
```go
func TestUserValidation(t *testing.T) {
    tests := []struct {
        name    string
        input   User
        wantErr bool
    }{
        {
            name:    "valid user",
            input:   User{Email: "test@example.com", Name: "Test"},
            wantErr: false,
        },
        {
            name:    "missing email",
            input:   User{Name: "Test"},
            wantErr: true,
        },
        {
            name:    "empty name",
            input:   User{Email: "test@example.com"},
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateUser(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("ValidateUser() error = %v, wantErr %v", err, tt.wantErr)
            }
        })
    }
}
```

---

## Mockery Usage

**Generate mocks:** `go run github.com/vektra/mockery/v2@latest`

**Create mock in test:**
```go
func TestUserService_GetProfile(t *testing.T) {
    mockRepo := mocks.NewMockUserRepository(t)

    mockRepo.EXPECT().
        GetByID(mock.Anything, "user-123").
        Return(&models.User{ID: "user-123", Name: "Test"}, nil)

    svc := services.NewUserService(mockRepo, zap.NewNop())

    user, err := svc.GetUser(context.Background(), "user-123")
    assert.NoError(t, err)
    assert.Equal(t, "Test", user.Name)
}
```

**Flexible matching with `mock.Anything`:**
```go
mockRepo.EXPECT().
    Create(mock.Anything, mock.AnythingOfType("*models.User")).
    Return(nil)
```

**Multiple calls:**
```go
mockRepo.EXPECT().
    GetByID(mock.Anything, mock.Anything).
    Return(nil, nil).
    Times(2)
```

---

## Testify Assertions

**Common assertions:**
```go
import "github.com/stretchr/testify/assert"

assert.NoError(t, err)
assert.Error(t, err)
assert.Equal(t, expected, actual)
assert.NotEqual(t, unexpected, actual)
assert.Nil(t, value)
assert.NotNil(t, value)
assert.True(t, condition)
assert.False(t, condition)
assert.Contains(t, slice, element)
assert.Len(t, slice, expectedLen)
```

**Require for fatal assertions:**
```go
import "github.com/stretchr/testify/require"

require.NoError(t, err)  // Fails test immediately if error
user := result.(*models.User)
require.NotNil(t, user)
```

---

## Test Naming

- Test functions: `TestTypeName_MethodName` or `TestFunctionName`
- Subtest names: descriptive, lowercase with spaces allowed
- File names: `*_test.go` alongside implementation

```go
// user_service_test.go
func TestUserService_CreateUser(t *testing.T) {
    t.Run("creates user with valid input", func(t *testing.T) { ... })
    t.Run("returns error for duplicate email", func(t *testing.T) { ... })
    t.Run("returns error for empty name", func(t *testing.T) { ... })
}
```

---

## Test Setup

**Helper for common setup:**
```go
func setupTestService(t *testing.T) (*services.UserService, *mocks.MockUserRepository) {
    t.Helper()
    mockRepo := mocks.NewMockUserRepository(t)
    svc := services.NewUserService(mockRepo, zap.NewNop())
    return svc, mockRepo
}
```

**Context with timeout:**
```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
```

---

## Integration Tests

**Use build tags for integration tests:**
```go
//go:build integration

package services_test

func TestUserService_Integration(t *testing.T) {
    // requires database connection
}
```

**Run integration tests:** `go test -tags=integration ./...`
