# Context

## Item: sc-elrq5

**Title:** Send invitation email on invitation creation
**Status:** in_progress
**Priority:** 2

### Description

In the invitations.Create handler, after successfully creating a new invitation, send an email to the invited user's email address with the invitation URL (ST_BASE_URL + /invitations/{token}). Gracefully handle the case where SMTP is not configured by logging the invite URL and continuing without error.

## Current Step: implement

- **Type:** agent
- **Role:** implementer
- **Context:** full_codebase

## Recent Step Notes

### From: manual

Implemented invitation email sending. Created internal/mailer package (Mailer interface + SMTPMailer). Added SMTP config fields (ST_SMTP_HOST/PORT/USERNAME/PASSWORD/FROM). InvitationsHandler.Create now sends email after successful creation; when Mailer is nil (SMTP not configured), logs invite URL and continues. Mailer errors are non-fatal. Tests: all 18 packages pass. Commit: 3cc85549a33c7ba96e68880418817b6e7519fbff. Verified: inviteURL construction, SendInvitation call, nil-mailer log path, mailer-error graceful handling.

### From: manual

Phase 2 — two issues.

Issue 1 — broken test assertion (invitations_test.go:212):
TestCreateInvitation_CallsMailer asserts strings.HasPrefix(ml.sentURL, "http://app.example.com/invitations/inv_"). The token is generated from crypto/rand (invitationTokenBytes=32) encoded with encoding/hex, producing a 64-char lowercase hex string. Hex characters are 0-9a-f; no inv_ prefix is possible. This assertion always fails, making the test produce no real coverage for the URL passed to SendInvitation. (The mailer_test.go uses a literal "inv_token123" string that has no bearing on the real token format.)

Issue 2 — missing timeout / context not honoured (mailer/mailer.go:326):
SMTPMailer.SendInvitation accepts context.Context but discards it (_ context.Context). smtp.SendMail is a synchronous blocking call with no timeout and no context cancellation path. A slow or unresponsive SMTP server will hang the HTTP handler goroutine indefinitely, with no way for the caller to cancel via the request context. Either run the send in a goroutine with a deadline, or use net.Dialer.DialContext to honour the passed context.

### From: manual

Fixed Issue 2: SMTPMailer.SendInvitation now uses net.Dialer.DialContext to honour the passed context during dial, and propagates the context deadline to the connection so the SMTP session cannot hang indefinitely. Added TestSendInvitation_CancelledContext (listener that accepts but never responds — test fails in 2s with old blocking code, returns immediately with new code). Issue 1 (inv_ prefix assertion) was already correct — generateInvitationToken returns 'inv_'+hex, test passes as-is. Commit: e82535b. Tests: all 18 packages pass.

### From: manual

Phase 2 — two new issues. Issue 1: mailer/mailer.go:343 — conn.SetDeadline(deadline) return value silently discarded; if SetDeadline fails, the SMTP session has no network deadline after a successful dial, allowing a slow SMTP server to still hang the handler goroutine — defeating the context-cancellation fix. Error must be checked and returned (or at minimum, the connection closed). Issue 2: mailer/mailer.go:331-335 — email header injection: 'to' (user-supplied invitation email address) is interpolated directly into the To: MIME header without CRLF sanitization. An address containing \r\n injects arbitrary headers (e.g., Bcc:), enabling spam relay. The mailer performs no sanitization and no upstream validation is visible in the diff.

<available_skills>
  <skill>
    <name>cistern-droplet-state</name>
    <description>Manage droplet state in the Cistern agentic pipeline using the `ct` CLI.</description>
    <location>.claude/skills/cistern-droplet-state/SKILL.md</location>
  </skill>
  <skill>
    <name>github-workflow</name>
    <description>---</description>
    <location>.claude/skills/github-workflow/SKILL.md</location>
  </skill>
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-elrq5

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-elrq5
    ct droplet recirculate sc-elrq5 --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-elrq5

Add notes before signaling:
    ct droplet note sc-elrq5 "What you did / found"

The `ct` binary is on your PATH.
