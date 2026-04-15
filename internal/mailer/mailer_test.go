package mailer

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"
)

func TestUniqueBoundary_IsUniqueAcrossCalls(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		b := uniqueBoundary()
		if seen[b] {
			t.Fatalf("duplicate boundary: %s", b)
		}
		seen[b] = true
		if !strings.HasPrefix(b, "boundary_") {
			t.Errorf("boundary %q should start with 'boundary_'", b)
		}
	}
}

func TestUniqueBoundary_HasSufficientLength(t *testing.T) {
	b := uniqueBoundary()
	minLen := len("boundary_") + 32
	if len(b) < minLen {
		t.Errorf("boundary %q is too short (%d chars, need >= %d)", b, len(b), minLen)
	}
	if len(b) > 128 {
		t.Errorf("boundary %q is too long (%d chars)", b, len(b))
	}
}

func TestSendInvitation_UsesMultipartWithBoundary(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	_, portStr, _ := net.SplitHostPort(ln.Addr().String())
	var port int
	fmt.Sscanf(portStr, "%d", &port)

	received := make(chan string, 1)
	go fakeSMTP(t, ln, received)

	m := New("127.0.0.1", port, "", "", "noreply@test.com")
	err = m.SendInvitation(context.Background(), "invitee@example.com", "http://app.example.com/invitations/inv_testboundary")
	if err != nil {
		t.Fatalf("SendInvitation error: %v", err)
	}

	body := <-received
	if !strings.Contains(body, "multipart/alternative") {
		t.Errorf("message missing multipart/alternative content type, got:\n%s", body)
	}
	if !strings.Contains(body, "text/plain") {
		t.Errorf("message missing text/plain part, got:\n%s", body)
	}
	if !strings.Contains(body, "text/html") {
		t.Errorf("message missing text/html part, got:\n%s", body)
	}
	if !strings.Contains(body, "boundary_") {
		t.Errorf("message uses hardcoded boundary instead of unique boundary, got:\n%s", body)
	}
	if strings.Contains(body, "boundary123") {
		t.Errorf("message uses hardcoded 'boundary123' boundary, got:\n%s", body)
	}
}

// compile-time interface check
var _ Mailer = (*SMTPMailer)(nil)

func TestNew_NilForEmptyHost(t *testing.T) {
	if m := New("", 587, "", "", "noreply@example.com"); m != nil {
		t.Error("expected nil Mailer when SMTP host is empty")
	}
}

func TestNew_NonNilForConfiguredHost(t *testing.T) {
	m := New("smtp.example.com", 587, "user", "pass", "noreply@example.com")
	if m == nil {
		t.Error("expected non-nil Mailer when SMTP host is configured")
	}
}

func TestSendInvitation_DeliversEmail(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	_, portStr, _ := net.SplitHostPort(ln.Addr().String())
	var port int
	fmt.Sscanf(portStr, "%d", &port)

	received := make(chan string, 1)
	go fakeSMTP(t, ln, received)

	m := New("127.0.0.1", port, "", "", "noreply@test.com")
	err = m.SendInvitation(context.Background(), "invitee@example.com", "http://app.example.com/invitations/inv_token123")
	if err != nil {
		t.Fatalf("SendInvitation error: %v", err)
	}

	body := <-received
	if !strings.Contains(body, "invitee@example.com") {
		t.Errorf("message missing To address, got:\n%s", body)
	}
	if !strings.Contains(body, "inv_token123") {
		t.Errorf("message missing invite URL, got:\n%s", body)
	}
}

func TestSendInvitation_CancelledContext(t *testing.T) {
	// Start a listener that accepts connections but never writes (simulates hung SMTP).
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			// Accept but never respond — hangs the caller unless context is honoured.
			defer conn.Close()
		}
	}()

	_, portStr, _ := net.SplitHostPort(ln.Addr().String())
	var port int
	fmt.Sscanf(portStr, "%d", &port)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // pre-cancel so DialContext must return immediately

	m := &SMTPMailer{host: "127.0.0.1", port: port, from: "noreply@test.com"}

	done := make(chan error, 1)
	go func() {
		done <- m.SendInvitation(ctx, "invitee@example.com", "http://app.example.com/invitations/inv_abc")
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Error("expected error with cancelled context, got nil")
		}
	case <-time.After(2 * time.Second):
		t.Error("SendInvitation did not respect context cancellation (hung for 2s)")
	}
}

// failSetDeadlineConn wraps a net.Conn and always returns an error from SetDeadline.
type failSetDeadlineConn struct {
	net.Conn
}

func (f *failSetDeadlineConn) SetDeadline(t time.Time) error {
	return fmt.Errorf("SetDeadline: intentional test failure")
}

func TestSendInvitation_SetDeadlineError(t *testing.T) {
	m := &SMTPMailer{
		host: "127.0.0.1",
		port: 9999,
		from: "noreply@test.com",
		dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			server, client := net.Pipe()
			server.Close() // not needed; close to avoid goroutine leak
			return &failSetDeadlineConn{Conn: client}, nil
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := m.SendInvitation(ctx, "invitee@example.com", "http://app.example.com/invitations/inv_abc")
	if err == nil {
		t.Fatal("expected error when SetDeadline fails, got nil")
	}
	if !strings.Contains(err.Error(), "set deadline") {
		t.Errorf("expected 'set deadline' in error, got: %v", err)
	}
}

func TestSendInvitation_RejectsHeaderInjection(t *testing.T) {
	dialCalled := false
	m := &SMTPMailer{
		host: "127.0.0.1",
		port: 9999,
		from: "noreply@test.com",
		dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			dialCalled = true
			return nil, fmt.Errorf("should not be reached")
		},
	}

	err := m.SendInvitation(
		context.Background(),
		"evil@example.com\r\nBcc: victim@example.com",
		"http://app.example.com/invitations/inv_abc",
	)
	if err == nil {
		t.Error("expected error for CRLF injection in To address, got nil")
	}
	if dialCalled {
		t.Error("dial was called — validation must happen before dialing")
	}
}

// fakeSMTP runs a minimal SMTP server on ln, sending the received DATA body to ch.
func fakeSMTP(t *testing.T, ln net.Listener, ch chan<- string) {
	t.Helper()
	conn, err := ln.Accept()
	if err != nil {
		return
	}
	defer conn.Close()

	rw := bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))
	write := func(s string) {
		rw.WriteString(s + "\r\n")
		rw.Flush()
	}
	write("220 fakesmtp ready")

	var body strings.Builder
	inData := false

	for {
		line, err := rw.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimRight(line, "\r\n")

		if inData {
			if line == "." {
				write("250 OK")
				ch <- body.String()
				inData = false
			} else {
				body.WriteString(line + "\n")
			}
			continue
		}

		switch {
		case strings.HasPrefix(line, "EHLO"), strings.HasPrefix(line, "HELO"):
			write("250 OK")
		case strings.HasPrefix(line, "MAIL FROM"):
			write("250 OK")
		case strings.HasPrefix(line, "RCPT TO"):
			write("250 OK")
		case line == "DATA":
			write("354 Start input, end with <CRLF>.<CRLF>")
			inData = true
		case strings.HasPrefix(line, "QUIT"):
			write("221 Bye")
			return
		default:
			write("500 Unknown command")
		}
	}
}
