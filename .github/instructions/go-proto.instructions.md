---
applyTo: "backend/api/proto/**/*.proto"
---

# Protocol Buffer Standards

Guidelines for gRPC service definitions in ScaledTest.

---

## gRPC-First API Design

**CRITICAL: All new backend API endpoints MUST be defined as Protocol Buffers first.**

ScaledTest uses a **gRPC-first architecture** with grpc-gateway for REST compatibility:

1. **Define services in `.proto` files** in `backend/api/proto/`
2. **Generate Go code** using `buf generate`
3. **REST endpoints are auto-generated** via grpc-gateway HTTP annotations
4. **CLI and frontend clients** use generated gRPC/Connect-web clients

**NEVER:**
- Create new REST endpoints directly in Fiber without proto definitions
- Define API types in Go structs instead of proto messages
- Manually implement REST routes that could be grpc-gateway generated

---

## HTTP Annotations for REST

Add `google.api.http` annotations for REST endpoint generation:

```protobuf
import "google/api/annotations.proto";

service ExampleService {
  rpc GetExample(GetExampleRequest) returns (ExampleResponse) {
    option (google.api.http) = {
      get: "/api/v1/examples/{id}"
    };
  }
  
  rpc CreateExample(CreateExampleRequest) returns (ExampleResponse) {
    option (google.api.http) = {
      post: "/api/v1/examples"
      body: "*"
    };
  }
  
  rpc ListExamples(ListExamplesRequest) returns (ListExamplesResponse) {
    option (google.api.http) = {
      get: "/api/v1/examples"
    };
  }
}
```

---

## Syntax and Package

```protobuf
syntax = "proto3";

package scaledtest.v1;

option go_package = "github.com/MichielDean/ScaledTest/backend/api/proto";
```

---

## Naming Conventions

- **Messages:** PascalCase (`UserRequest`, `TestResultResponse`)
- **Fields:** snake_case (`user_id`, `created_at`)
- **Services:** PascalCase (`UserService`, `TestResultService`)
- **RPC methods:** PascalCase (`GetUser`, `CreateTestResult`)

---

## Message Design

**Request/Response pairs:**
```protobuf
message GetUserRequest {
    string user_id = 1;
}

message GetUserResponse {
    User user = 1;
}

message ListUsersRequest {
    int32 page = 1;
    int32 page_size = 2;
}

message ListUsersResponse {
    repeated User users = 1;
    int32 total_count = 2;
}
```

**Reusable messages:**
```protobuf
message User {
    string id = 1;
    string email = 2;
    string name = 3;
    string role = 4;
    google.protobuf.Timestamp created_at = 5;
}
```

---

## Service Definition

```protobuf
service UserService {
    rpc GetUser(GetUserRequest) returns (GetUserResponse);
    rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
    rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
    rpc UpdateUser(UpdateUserRequest) returns (UpdateUserResponse);
    rpc DeleteUser(DeleteUserRequest) returns (DeleteUserResponse);
}
```

---

## Field Numbering

- Use sequential numbers starting from 1
- Reserve numbers 1-15 for frequently used fields (smaller wire format)
- Never reuse field numbers after deletion — use `reserved`

```protobuf
message User {
    reserved 4;  // was: deprecated_field
    string id = 1;
    string email = 2;
    string name = 3;
    // field 4 reserved
    string role = 5;
}
```

---

## Code Generation

**Never edit generated files manually.** Run generation after proto changes:

```powershell
# Windows (preferred)
cd backend
buf generate
```

```bash
# Linux/macOS
cd backend && buf generate
```

Generated files: `*.pb.go`, `*_grpc.pb.go`, `*.pb.gw.go`, `*connect*.go`

---

## CTRF Test Results

Test results MUST use CTRF (Common Test Report Format). Generate Go types from the official schema:

```bash
go-jsonschema -p ctrf schema/ctrf.json -o internal/models/ctrf_types.go
```

**NEVER** store test results as raw JSONB — always deserialize into normalized database tables (`ctrf_reports`, `ctrf_tests`, etc.).
