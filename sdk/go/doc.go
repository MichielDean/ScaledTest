// Package scaledtest provides a Go client for the ScaledTest API.
//
// Usage:
//
//	client, err := scaledtest.NewClient("https://your-instance.example.com",
//	    scaledtest.WithToken("sct_your_api_token"),
//	)
//	if err != nil {
//	    log.Fatal(err)
//	}
//	reports, err := client.Reports.List(context.Background(), nil)
//
// All API routes are under /api/v1/. Authentication uses Bearer tokens (JWT or
// sct_ API tokens) via the Authorization header. The client has no external
// dependencies beyond the Go standard library, matching the ScaledTest
// backend's minimal dependency philosophy.
package scaledtest
