package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/config"
	"github.com/scaledtest/scaledtest/internal/smtptransient"
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
	host       string
	port       int
	user       string
	pass       string
	from       string
	maxRetries int
}

// sanitizeHeader strips CR and LF characters from an email header value
// to prevent header injection attacks.
func sanitizeHeader(s string) string {
	return strings.NewReplacer("\r", "", "\n", "").Replace(s)
}

// Send delivers msg via SMTP, respecting ctx for cancellation and timeouts.
// It retries on transient SMTP errors (5xx responses and connection timeouts)
// with exponential backoff. Client errors (auth, invalid recipient) are not retried.
func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	var lastErr error
	for attempt := 0; attempt <= s.maxRetries; attempt++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		lastErr = s.sendOnce(ctx, msg)
		if lastErr == nil {
			return nil
		}

		if !smtptransient.IsTransient(lastErr) {
			return lastErr
		}

		if attempt < s.maxRetries {
			backoff := time.Duration(1<<uint(attempt)) * time.Second
			log.Warn().Err(lastErr).
				Int("attempt", attempt+1).
				Str("to", msg.To).
				Dur("backoff", backoff).
				Msg("mail: retrying SMTP send")

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}
	}
	return lastErr
}

// IsTransientSMTPError returns true for errors that are worth retrying.
// Delegates to the shared smtptransient package.
func IsTransientSMTPError(err error) bool {
	return smtptransient.IsTransient(err)
}

func (s *SMTPSender) sendOnce(ctx context.Context, msg Message) error {
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

	// Propagate context cancellation/deadline to all post-connect SMTP
	// operations by closing the underlying connection when ctx is done.
	// Without this, a server that stalls after TCP accept blocks forever.
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			conn.Close()
		case <-done:
		}
	}()

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
		host:       cfg.SMTPHost,
		port:       cfg.SMTPPort,
		user:       cfg.SMTPUser,
		pass:       cfg.SMTPPass,
		from:       cfg.SMTPFrom,
		maxRetries: smtptransient.DefaultRetries,
	}
}
