package webhook

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSignAndVerify(t *testing.T) {
	payload := []byte(`{"event":"report.created","data":{}}`)
	secret := "my-webhook-secret"

	sig := Sign(payload, secret)

	if !Verify(payload, secret, sig) {
		t.Error("Verify() returned false for correct signature")
	}
	if Verify(payload, "wrong-secret", sig) {
		t.Error("Verify() returned true for wrong secret")
	}
	if Verify([]byte("tampered"), secret, sig) {
		t.Error("Verify() returned true for tampered payload")
	}
}

func TestSendSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify headers
		if r.Header.Get("Content-Type") != "application/json" {
			t.Error("missing Content-Type header")
		}
		if r.Header.Get("X-ScaledTest-Event") != "report.created" {
			t.Errorf("X-ScaledTest-Event = %q", r.Header.Get("X-ScaledTest-Event"))
		}
		if r.Header.Get("X-ScaledTest-Signature") == "" {
			t.Error("missing X-ScaledTest-Signature header")
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	d := NewDispatcher()
	payload := Payload{
		Event:     EventReportCreated,
		Timestamp: time.Now(),
		Data:      map[string]string{"report_id": "r-123"},
	}

	delivery, err := d.Send(context.Background(), server.URL, "secret", payload)
	if err != nil {
		t.Fatalf("Send() error: %v", err)
	}
	if delivery.StatusCode != http.StatusOK {
		t.Errorf("StatusCode = %d, want %d", delivery.StatusCode, http.StatusOK)
	}
}

func TestSendClientError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	d := NewDispatcher()
	payload := Payload{Event: EventReportCreated, Data: nil}

	_, err := d.Send(context.Background(), server.URL, "secret", payload)
	if err == nil {
		t.Error("expected error for 400 response")
	}
}

func TestSendSignatureVerification(t *testing.T) {
	secret := "test-secret-for-hmac"
	var receivedSig string
	var receivedBody []byte

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedSig = r.Header.Get("X-ScaledTest-Signature")
		var err error
		receivedBody, err = io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("failed to read body: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	d := NewDispatcher()
	payload := Payload{
		Event: EventExecutionCompleted,
		Data:  map[string]string{"id": "exec-1"},
	}

	d.Send(context.Background(), server.URL, secret, payload)

	// Verify the signature against the actual received bytes
	if !Verify(receivedBody, secret, receivedSig) {
		t.Error("receiver could not verify signature against actual received bytes")
	}
}
