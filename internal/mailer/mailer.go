package mailer

import (
	"context"
	"crypto/tls"
	"fmt"
	"math"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

const defaultSMTPRetries = 3

// Mailer sends invitation emails.
type Mailer interface {
	SendInvitation(ctx context.Context, to, inviteURL string) error
}

// SMTPMailer delivers emails via SMTP with retry support.
type SMTPMailer struct {
	host       string
	port       int
	username   string
	password   string
	from       string
	maxRetries int
	// dial establishes the TCP connection; defaults to net.Dialer.DialContext.
	// Overridden in tests to inject mock connections.
	dial func(ctx context.Context, network, address string) (net.Conn, error)
}

// New returns an SMTPMailer for the given SMTP configuration.
// Returns nil when host is empty (SMTP not configured).
func New(host string, port int, username, password, from string) Mailer {
	if host == "" {
		return nil
	}
	return &SMTPMailer{
		host:       host,
		port:       port,
		username:   username,
		password:   password,
		from:       from,
		maxRetries: defaultSMTPRetries,
		dial:       (&net.Dialer{}).DialContext,
	}
}

// isTransientSMTPError determines if an SMTP error is worth retrying.
func isTransientSMTPError(err error) bool {
	if err == nil {
		return false
	}
	var netErr net.Error
	if netErr != nil {
		return true
	}
	msg := err.Error()
	if strings.Contains(msg, "smtp dial:") ||
		strings.Contains(msg, "smtp starttls:") ||
		strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "i/o timeout") {
		return true
	}
	if strings.Contains(msg, "55") || strings.Contains(msg, "54") ||
		strings.Contains(msg, "451") || strings.Contains(msg, "452") ||
		strings.Contains(msg, "421") {
		return true
	}
	return false
}

// SendInvitation sends an invitation email to the given address with both
// plaintext and HTML alternative parts. It retries on transient SMTP errors
// with exponential backoff.
func (m *SMTPMailer) SendInvitation(ctx context.Context, to, inviteURL string) error {
	if strings.ContainsAny(to, "\r\n") {
		return fmt.Errorf("invalid recipient address: contains CRLF")
	}

	textBody := fmt.Sprintf(
		"You have been invited to join ScaledTest.\r\n\r\n"+
			"Accept your invitation:\r\n%s\r\n",
		inviteURL,
	)
	htmlBody := buildInvitationHTML(inviteURL)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: You've been invited to ScaledTest\r\n"+
		"MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=boundary123\r\n\r\n"+
		"--boundary123\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n"+
		"--boundary123\r\nContent-Type: text/html; charset=utf-8\r\n\r\n%s\r\n--boundary123--\r\n",
		m.from, to, textBody, htmlBody)

	return m.sendWithRetry(ctx, to, []byte(msg))
}

func buildInvitationHTML(inviteURL string) string {
	escapedURL := htmlEscapeAttr(inviteURL)
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
<table style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden;">
<tr><td style="padding: 30px; text-align: center; background: #1a1a2e;">
<h1 style="color: #ffffff; margin: 0;">ScaledTest</h1>
</td></tr>
<tr><td style="padding: 30px;">
<p style="font-size: 16px; color: #333;">You have been invited to join ScaledTest.</p>
<a href="%s" style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px;">Accept Invitation</a>
</td></tr>
</table>
</body>
</html>`, escapedURL)
}

func htmlEscapeAttr(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	s = strings.ReplaceAll(s, "'", "&#39;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

func (m *SMTPMailer) sendWithRetry(ctx context.Context, to string, msg []byte) error {
	var lastErr error
	for attempt := 0; attempt <= m.maxRetries; attempt++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		lastErr = m.sendOnce(ctx, to, msg)
		if lastErr == nil {
			return nil
		}

		if !isTransientSMTPError(lastErr) {
			return lastErr
		}

		if attempt < m.maxRetries {
			backoff := time.Duration(math.Pow(2, float64(attempt))) * time.Second
			log.Warn().Err(lastErr).
				Int("attempt", attempt+1).
				Str("to", to).
				Dur("backoff", backoff).
				Msg("mailer: retrying SMTP send")

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}
	}
	return lastErr
}

func (m *SMTPMailer) sendOnce(ctx context.Context, to string, msg []byte) error {
	addr := fmt.Sprintf("%s:%d", m.host, m.port)

	dialFn := m.dial
	if dialFn == nil {
		dialFn = (&net.Dialer{}).DialContext
	}
	conn, err := dialFn(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	if deadline, ok := ctx.Deadline(); ok {
		if err := conn.SetDeadline(deadline); err != nil {
			conn.Close()
			return fmt.Errorf("smtp set deadline: %w", err)
		}
	}

	client, err := smtp.NewClient(conn, m.host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: m.host}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}

	if m.username != "" {
		if err := client.Auth(smtp.PlainAuth("", m.username, m.password, m.host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := client.Mail(m.from); err != nil {
		return fmt.Errorf("smtp MAIL: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp RCPT: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp data close: %w", err)
	}
	return client.Quit()
}
