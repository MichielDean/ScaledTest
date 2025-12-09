---
applyTo: "backend/api/proto/**/*.proto"
---

# Protocol Buffer Standards

Guidelines for gRPC service definitions in ScaledTest.

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
# Windows
.\backend\scripts\generate-proto.ps1

# Linux/macOS
./backend/scripts/generate-proto.sh
```

Generated files: `*.pb.go`, `*_grpc.pb.go`
