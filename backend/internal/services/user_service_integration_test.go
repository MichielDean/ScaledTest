// +build integration

package services

import (
	"context"
	"testing"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestUserServiceIntegration_GetUserProfile(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()
	service := NewUserService(testDB, testLogger)

	// Setup: Create test user
	userID := createTestUser(t, ctx, "integration1@example.com", "Integration User 1")
	defer cleanupTestData(t, ctx)

	t.Run("Success - Get existing user", func(t *testing.T) {
		req := &proto.GetUserProfileRequest{UserId: userID}
		resp, err := service.GetUserProfile(ctx, req)

		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if resp.Id != userID {
			t.Errorf("Expected user ID %s, got %s", userID, resp.Id)
		}

		if resp.Email != "integration1@example.com" {
			t.Errorf("Expected email integration1@example.com, got %s", resp.Email)
		}

		if resp.Name != "Integration User 1" {
			t.Errorf("Expected name 'Integration User 1', got %s", resp.Name)
		}
	})

	t.Run("Error - User not found", func(t *testing.T) {
		req := &proto.GetUserProfileRequest{UserId: "nonexistent-user"}
		_, err := service.GetUserProfile(ctx, req)

		if err == nil {
			t.Fatal("Expected error for nonexistent user, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatal("Expected gRPC status error")
		}

		if st.Code() != codes.NotFound {
			t.Errorf("Expected NotFound status, got %v", st.Code())
		}
	})
}

func TestUserServiceIntegration_UpdateUserProfile(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()
	service := NewUserService(testDB, testLogger)

	// Setup: Create test user
	userID := createTestUser(t, ctx, "integration2@example.com", "Original Name")
	defer cleanupTestData(t, ctx)

	t.Run("Success - Update user name", func(t *testing.T) {
		newName := "Updated Name"
		req := &proto.UpdateUserProfileRequest{
			UserId: userID,
			Name:   &newName,
		}

		resp, err := service.UpdateUserProfile(ctx, req)
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if resp.Name != newName {
			t.Errorf("Expected name '%s', got '%s'", newName, resp.Name)
		}

		// Verify the update persisted
		getReq := &proto.GetUserProfileRequest{UserId: userID}
		getResp, err := service.GetUserProfile(ctx, getReq)
		if err != nil {
			t.Fatalf("Expected no error on get, got %v", err)
		}

		if getResp.Name != newName {
			t.Errorf("Expected persisted name '%s', got '%s'", newName, getResp.Name)
		}
	})
}

func TestUserServiceIntegration_ListUsers(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()
	service := NewUserService(testDB, testLogger)

	// Setup: Create multiple test users
	createTestUser(t, ctx, "list1@example.com", "Alice")
	createTestUser(t, ctx, "list2@example.com", "Bob")
	createTestUser(t, ctx, "list3@example.com", "Charlie")
	defer cleanupTestData(t, ctx)

	t.Run("Success - List users with pagination", func(t *testing.T) {
		req := &proto.ListUsersRequest{
			Page:     1,
			PageSize: 10,
		}

		resp, err := service.ListUsers(ctx, req)
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		if len(resp.Users) < 3 {
			t.Errorf("Expected at least 3 users, got %d", len(resp.Users))
		}

		if resp.TotalCount < 3 {
			t.Errorf("Expected total count >= 3, got %d", resp.TotalCount)
		}
	})

	t.Run("Success - Search users by name", func(t *testing.T) {
		search := "Alice"
		req := &proto.ListUsersRequest{
			Page:     1,
			PageSize: 10,
			Search:   &search,
		}

		resp, err := service.ListUsers(ctx, req)
		if err != nil {
			t.Fatalf("Expected no error, got %v", err)
		}

		// Should find at least the Alice user
		found := false
		for _, user := range resp.Users {
			if user.Name == "Alice" {
				found = true
				break
			}
		}

		if !found {
			t.Error("Expected to find Alice in search results")
		}
	})
}
