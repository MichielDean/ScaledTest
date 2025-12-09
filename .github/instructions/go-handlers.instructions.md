---
applyTo: "backend/internal/handlers/**/*.go"
---

# Go Handler Standards

Guidelines for HTTP and gRPC handlers in ScaledTest. Handlers depend on service interfaces only.

---

## Handler Pattern

**Return a closure that captures dependencies:**
```go
func CreateUserHandler(svc services.UserManager, logger *zap.Logger) fiber.Handler {
    return func(c *fiber.Ctx) error {
        // handler logic
    }
}
```

---

## Request Parsing

**Always validate parsed requests:**
```go
var req CreateUserRequest
if err := c.BodyParser(&req); err != nil {
    logger.Warn("Invalid request body", zap.Error(err))
    return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
        "error": "Invalid request body",
    })
}

if req.Email == "" || req.Password == "" {
    return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
        "error": "Email and password are required",
    })
}
```

**Path and query parameters:**
```go
userID := c.Params("id")                    // /users/:id
page := c.QueryInt("page", 1)               // ?page=2
includeDeleted := c.QueryBool("deleted")    // ?deleted=true
```

---

## JSON Responses

**Use `fiber.Map` for error responses:**
```go
return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
    "error": "User not found",
})
```

**Return structs for success responses:**
```go
return c.Status(fiber.StatusCreated).JSON(user)
return c.JSON(ListUsersResponse{Users: users, Total: total})
```

**Common status codes:**
- `StatusOK` (200) — successful GET, PUT
- `StatusCreated` (201) — successful POST creating resource
- `StatusNoContent` (204) — successful DELETE
- `StatusBadRequest` (400) — invalid input
- `StatusUnauthorized` (401) — missing/invalid auth
- `StatusForbidden` (403) — valid auth, insufficient permissions
- `StatusNotFound` (404) — resource doesn't exist
- `StatusInternalServerError` (500) — unexpected errors

---

## Logging

**Log with request context:**
```go
logger.Info("User created",
    zap.String("userId", user.ID),
    zap.String("email", user.Email))

logger.Error("Failed to create user",
    zap.Error(err),
    zap.String("email", req.Email))

logger.Warn("Invalid request", zap.Error(err))
```

**Never expose internal errors to clients:**
```go
// ✅ Log details, return generic message
logger.Error("Database query failed", zap.Error(err), zap.String("query", query))
return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
    "error": "Failed to process request",
})
```

---

## Middleware Integration

**AuthMiddleware signature:**
```go
func AuthMiddleware(jwtSecret string, logger *zap.Logger) fiber.Handler
```

**Extracting user context from middleware:**
```go
userID := c.Locals("user_id").(string)
email := c.Locals("email").(string)
role := c.Locals("role").(string)
```

**JWT parsing in middleware:**
```go
authHeader := c.Get("Authorization")
if authHeader == "" {
    return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
        "error": "Missing authorization token",
    })
}

tokenString := strings.TrimPrefix(authHeader, "Bearer ")

token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
    if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
        return nil, fmt.Errorf("unexpected signing method")
    }
    return []byte(jwtSecret), nil
})

if err != nil || !token.Valid {
    return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
        "error": "Invalid or expired token",
    })
}

if claims, ok := token.Claims.(jwt.MapClaims); ok {
    c.Locals("user_id", claims["user_id"])
    c.Locals("email", claims["email"])
    c.Locals("role", claims["role"])
}

return c.Next()
```

---

## Architecture Constraints

- Handlers MUST depend on service interfaces, not concrete types
- Handlers MUST NOT import `repository` or `database` packages
- Maximum function size: 100 lines
