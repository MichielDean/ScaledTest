package smtptransient_test

import (
	"fmt"
	"testing"

	"github.com/scaledtest/scaledtest/internal/smtptransient"
)

func TestIsTransient_Nil(t *testing.T) {
	if smtptransient.IsTransient(nil) {
		t.Error("nil error should not be transient")
	}
}

func TestIsTransient_ConnectionRefused(t *testing.T) {
	err := fmt.Errorf("smtp dial: connection refused")
	if !smtptransient.IsTransient(err) {
		t.Error("connection refused should be transient")
	}
}

func TestIsTransient_Timeout(t *testing.T) {
	err := fmt.Errorf("smtp dial: i/o timeout")
	if !smtptransient.IsTransient(err) {
		t.Error("i/o timeout should be transient")
	}
}

func TestIsTransient_StartTLSError(t *testing.T) {
	err := fmt.Errorf("smtp starttls: handshake failure")
	if !smtptransient.IsTransient(err) {
		t.Error("STARTTLS error should be transient")
	}
}

func TestIsTransient_ClientError(t *testing.T) {
	err := fmt.Errorf("smtp auth: invalid credentials")
	if smtptransient.IsTransient(err) {
		t.Error("auth error should not be transient")
	}
}

func TestIsTransient_5xxResponse(t *testing.T) {
	err := fmt.Errorf("smtp RCPT TO: 552 5.2.2 mailbox full")
	if !smtptransient.IsTransient(err) {
		t.Error("5xx response should be transient")
	}
}

func TestIsTransient_4xxResponse(t *testing.T) {
	err := fmt.Errorf("smtp RCPT TO: 451 4.3.0 try again later")
	if !smtptransient.IsTransient(err) {
		t.Error("4xx response should be transient")
	}
}

func TestIsTransient_421Response(t *testing.T) {
	err := fmt.Errorf("421 4.7.0 connection rate limit exceeded")
	if !smtptransient.IsTransient(err) {
		t.Error("421 response should be transient")
	}
}

func TestIsTransient_452Response(t *testing.T) {
	err := fmt.Errorf("452 4.3.1 insufficient system storage")
	if !smtptransient.IsTransient(err) {
		t.Error("452 response should be transient")
	}
}

func TestIsTransient_FalsePositiveTimestamp(t *testing.T) {
	err := fmt.Errorf("smtp auth: invalid credentials at 2024-01-15 12:54:33")
	if smtptransient.IsTransient(err) {
		t.Error("timestamp containing 54 should not be transient")
	}
}

func TestIsTransient_FalsePositivePort(t *testing.T) {
	err := fmt.Errorf("failed to connect on port 5555")
	if smtptransient.IsTransient(err) {
		t.Error("port number containing 55 should not be transient")
	}
}

func TestIsTransient_FalsePositiveErrorID(t *testing.T) {
	err := fmt.Errorf("smtp auth: invalid credentials for request-55abc")
	if smtptransient.IsTransient(err) {
		t.Error("error ID containing 55 should not be transient")
	}
}

func TestIsTransient_NetError(t *testing.T) {
	err := &netError{msg: "network timeout", timeout: true}
	if !smtptransient.IsTransient(err) {
		t.Error("net.Error should be transient")
	}
}

type netError struct {
	msg     string
	timeout bool
}

func (e *netError) Error() string   { return e.msg }
func (e *netError) Timeout() bool   { return e.timeout }
func (e *netError) Temporary() bool { return e.timeout }

func TestDefaultRetries(t *testing.T) {
	if smtptransient.DefaultRetries != 3 {
		t.Errorf("DefaultRetries = %d, want 3", smtptransient.DefaultRetries)
	}
}
