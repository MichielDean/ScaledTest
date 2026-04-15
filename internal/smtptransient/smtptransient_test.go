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
