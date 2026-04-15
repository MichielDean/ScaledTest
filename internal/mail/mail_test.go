package mail_test

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/config"
	"github.com/scaledtest/scaledtest/internal/mail"
)

// Compile-time interface satisfaction checks.
var _ mail.Sender = (*mail.NoopSender)(nil)
var _ mail.Sender = (*mail.SMTPSender)(nil)

func TestNoopSender_Send_ReturnsNil(t *testing.T) {
	s := &mail.NoopSender{}
	err := s.Send(context.Background(), mail.Message{
		To:      "user@example.com",
		Subject: "Hello",
		Body:    "World",
	})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestNew_EmptySMTPHost_ReturnsNoopSender(t *testing.T) {
	cfg := &config.Config{}
	s := mail.New(cfg)
	if _, ok := s.(*mail.NoopSender); !ok {
		t.Fatalf("expected *mail.NoopSender, got %T", s)
	}
}

func TestNew_WithSMTPHost_ReturnsSMTPSender(t *testing.T) {
	cfg := &config.Config{
		SMTPHost: "smtp.example.com",
		SMTPPort: 587,
		SMTPUser: "user@example.com",
		SMTPPass: "secret",
		SMTPFrom: "noreply@example.com",
	}
	s := mail.New(cfg)
	if _, ok := s.(*mail.SMTPSender); !ok {
		t.Fatalf("expected *mail.SMTPSender, got %T", s)
	}
}

func TestSMTPSender_Send_FailsWithUnreachableHost(t *testing.T) {
	cfg := &config.Config{
		SMTPHost: "127.0.0.1",
		SMTPPort: 19999, // nothing listening here
		SMTPUser: "u",
		SMTPPass: "p",
		SMTPFrom: "from@example.com",
	}
	s := mail.New(cfg)
	err := s.Send(context.Background(), mail.Message{
		To:      "to@example.com",
		Subject: "Test",
		Body:    "body",
	})
	if err == nil {
		t.Fatal("expected error connecting to unreachable host, got nil")
	}
}

func TestSMTPSender_Send_ContextTimeoutAfterConnect_ReturnsError(t *testing.T) {
	// Start a listener that accepts TCP connections but never sends an SMTP
	// greeting, simulating a server that stalls after the TCP handshake.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			// Hold the connection open and write nothing.
			go func(c net.Conn) {
				defer c.Close()
				select {} //nolint:staticcheck
			}(c)
		}
	}()

	_, portStr, _ := net.SplitHostPort(ln.Addr().String())
	port, _ := strconv.Atoi(portStr)

	cfg := &config.Config{
		SMTPHost: "127.0.0.1",
		SMTPPort: port,
		SMTPFrom: "from@example.com",
	}
	s := mail.New(cfg)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	start := time.Now()
	err = s.Send(ctx, mail.Message{
		To:      "to@example.com",
		Subject: "Test",
		Body:    "body",
	})
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected error from stalled server with context timeout, got nil")
	}
	if elapsed > 5*time.Second {
		t.Fatalf("Send blocked for %v — context timeout not respected", elapsed)
	}
}

func TestSMTPSender_Send_CancelledContext_ReturnsError(t *testing.T) {
	cfg := &config.Config{
		SMTPHost: "127.0.0.1",
		SMTPPort: 19999,
		SMTPUser: "u",
		SMTPPass: "p",
		SMTPFrom: "from@example.com",
	}
	s := mail.New(cfg)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before dialing
	err := s.Send(ctx, mail.Message{
		To:      "to@example.com",
		Subject: "Test",
		Body:    "body",
	})
	if err == nil {
		t.Fatal("expected error with cancelled context, got nil")
	}
}

func TestIsTransientSMTPError_Nil(t *testing.T) {
	if mail.IsTransientSMTPError(nil) {
		t.Error("nil error should not be transient")
	}
}

func TestIsTransientSMTPError_ConnectionRefused(t *testing.T) {
	err := fmt.Errorf("smtp dial: connection refused")
	if !mail.IsTransientSMTPError(err) {
		t.Error("connection refused should be transient")
	}
}

func TestIsTransientSMTPError_Timeout(t *testing.T) {
	err := fmt.Errorf("smtp dial: i/o timeout")
	if !mail.IsTransientSMTPError(err) {
		t.Error("i/o timeout should be transient")
	}
}

func TestIsTransientSMTPError_StartTLSError(t *testing.T) {
	err := fmt.Errorf("smtp starttls: handshake failure")
	if !mail.IsTransientSMTPError(err) {
		t.Error("STARTTLS error should be transient")
	}
}

func TestIsTransientSMTPError_ClientError(t *testing.T) {
	err := fmt.Errorf("smtp auth: invalid credentials")
	if mail.IsTransientSMTPError(err) {
		t.Error("auth error should not be transient")
	}
}

func TestIsTransientSMTPError_5xxResponse(t *testing.T) {
	err := fmt.Errorf("smtp RCPT TO: 552 5.2.2 mailbox full")
	if !mail.IsTransientSMTPError(err) {
		t.Error("5xx response should be transient")
	}
}

func TestIsTransientSMTPError_4xxResponse(t *testing.T) {
	err := fmt.Errorf("smtp RCPT TO: 451 4.3.0 try again later")
	if !mail.IsTransientSMTPError(err) {
		t.Error("4xx response should be transient")
	}
}
