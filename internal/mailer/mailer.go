package mailer

import (
	"context"
	"fmt"
	"net"
	"net/smtp"
	"strings"
)

// Mailer sends invitation emails.
type Mailer interface {
	SendInvitation(ctx context.Context, to, inviteURL string) error
}

// SMTPMailer delivers emails via SMTP.
type SMTPMailer struct {
	host     string
	port     int
	username string
	password string
	from     string
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
		host:     host,
		port:     port,
		username: username,
		password: password,
		from:     from,
		dial:     (&net.Dialer{}).DialContext,
	}
}

// SendInvitation sends an invitation email to the given address.
// The context is honoured during the TCP dial; if the context has a deadline it
// is also applied to the connection so the SMTP session cannot outlive it.
func (m *SMTPMailer) SendInvitation(ctx context.Context, to, inviteURL string) error {
	if strings.ContainsAny(to, "\r\n") {
		return fmt.Errorf("invalid recipient address: contains CRLF")
	}

	addr := fmt.Sprintf("%s:%d", m.host, m.port)
	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: You've been invited to ScaledTest\r\n\r\n"+
			"You have been invited to join ScaledTest.\r\n\r\n"+
			"Accept your invitation:\r\n%s\r\n",
		m.from, to, inviteURL,
	)

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
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp data close: %w", err)
	}
	return client.Quit()
}
