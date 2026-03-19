package mail

import (
	"context"
	"fmt"
	"net/smtp"

	"github.com/scaledtest/scaledtest/internal/config"
)

// Message is an email to be sent.
type Message struct {
	To      string
	Subject string
	Body    string
}

// Sender is the interface for sending emails.
type Sender interface {
	Send(ctx context.Context, msg Message) error
}

// NoopSender is a no-op Sender used when SMTP is not configured.
type NoopSender struct{}

// Send discards the message and returns nil.
func (n *NoopSender) Send(_ context.Context, _ Message) error {
	return nil
}

// SMTPSender delivers email via SMTP using the configured credentials.
type SMTPSender struct {
	host string
	port int
	user string
	pass string
	from string
}

// Send delivers msg via SMTP.
func (s *SMTPSender) Send(_ context.Context, msg Message) error {
	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	auth := smtp.PlainAuth("", s.user, s.pass, s.host)
	body := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		s.from, msg.To, msg.Subject, msg.Body)
	return smtp.SendMail(addr, auth, s.from, []string{msg.To}, []byte(body))
}

// New returns a Sender configured from cfg.
// Returns a NoopSender when ST_SMTP_HOST is not set.
func New(cfg *config.Config) Sender {
	if cfg.SMTPHost == "" {
		return &NoopSender{}
	}
	return &SMTPSender{
		host: cfg.SMTPHost,
		port: cfg.SMTPPort,
		user: cfg.SMTPUser,
		pass: cfg.SMTPPass,
		from: cfg.SMTPFrom,
	}
}
