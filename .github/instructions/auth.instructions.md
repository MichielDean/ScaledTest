---
applyTo: "backend/internal/auth/**/*.go,backend/internal/middleware/**/*.go,backend/internal/handlers/auth*.go,backend/internal/handlers/user*.go,backend/internal/services/auth*.go,backend/internal/services/user*.go,backend/internal/repository/auth*.go,backend/internal/repository/user*.go,backend/api/proto/auth.proto,backend/api/proto/users.proto,frontend/src/contexts/**/*Auth*.tsx,frontend/src/pages/Login*.tsx,frontend/src/pages/Register*.tsx,frontend/src/pages/Profile*.tsx,frontend/src/pages/Unauthorized*.tsx,frontend/src/components/ProtectedRoute.tsx"
---

# Authentication Standards

Guidelines for authentication and authorization in ScaledTest.

---

## Backend Implementation

### JWT Tokens

- **Expiration:** 7 days for user sessions
- **Algorithm:** HS256 (HMAC-SHA256)
- **Claims:** `user_id`, `email`, `role`, `exp`, `iat`

```go
claims := jwt.MapClaims{
    "user_id": user.ID,
    "email":   user.Email,
    "role":    user.Role,
    "exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
    "iat":     time.Now().Unix(),
}
```

### Password Hashing

- **Algorithm:** bcrypt with cost factor 10
- **NEVER store plaintext passwords**

```go
hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
```

### AuthMiddleware

```go
// Fiber HTTP middleware
func AuthMiddleware(jwtSecret string, logger *zap.Logger) fiber.Handler

// gRPC/Connect interceptor
func AuthInterceptor(jwtSecret string, logger *zap.Logger) connect.UnaryInterceptorFunc
```

**User context from middleware:**
```go
userID := c.Locals("user_id").(string)
email := c.Locals("email").(string)
role := c.Locals("role").(string)
```

---

## Frontend Implementation

### AuthContext and useAuth Hook

```typescript
const { user, isAuthenticated, isLoading, signIn, signOut } = useAuth();
```

**AuthProvider wraps the app:**
```tsx
<AuthProvider>
  <App />
</AuthProvider>
```

### ProtectedRoute Component

```tsx
<ProtectedRoute requiredRole="admin">
  <AdminDashboard />
</ProtectedRoute>
```

---

## Backend-Agnostic UI Rules

**CRITICAL:** Never expose authentication backend implementation details in the UI.

### Do NOT use:
- "Realm", "client", "admin console" (Keycloak terminology)
- Provider-specific error messages
- Backend configuration details in user-facing text

### DO use:
- Generic terms: "Sign in", "Sign out", "Register", "Forgot password"
- User-friendly error messages: "Invalid email or password"
- Abstract authentication state, not provider state

### Error Translation

```typescript
// ❌ WRONG - Exposes backend details
"Invalid client credentials"
"Realm not found"

// ✅ CORRECT - User-friendly
"Invalid email or password"
"Unable to sign in. Please try again."
```

---

## Security Requirements

- Store tokens securely (httpOnly cookies or secure storage)
- Clear tokens on sign out
- Validate tokens on every protected request
- Never log passwords or tokens (even hashed)
- Use HTTPS in production
