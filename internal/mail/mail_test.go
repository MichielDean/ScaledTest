package mail_test

import (
	"context"
	"testing"

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
