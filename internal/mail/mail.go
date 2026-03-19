package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"

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

// sanitizeHeader strips CR and LF characters from an email header value
// to prevent header injection attacks.
func sanitizeHeader(s string) string {
	return strings.NewReplacer("\r", "", "\n", "").Replace(s)
}

// Send delivers msg via SMTP, respecting ctx for cancellation and timeouts.
// Header fields are sanitized to prevent header injection.
func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	addr := fmt.Sprintf("%s:%d", s.host, s.port)

	// Sanitize header fields to prevent CRLF injection.
	to := sanitizeHeader(msg.To)
	subject := sanitizeHeader(msg.Subject)
	from := sanitizeHeader(s.from)

	// Dial with context so callers can cancel or time out the operation.
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}

	client, err := smtp.NewClient(conn, s.host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	// Upgrade to TLS via STARTTLS if the server advertises it.
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: s.host}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}

	// Authenticate when credentials are provided.
	if s.user != "" {
		if err := client.Auth(smtp.PlainAuth("", s.user, s.pass, s.host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp RCPT TO: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}

	body := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		from, to, subject, msg.Body)
	if _, err := fmt.Fprint(w, body); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}

	return w.Close()
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
