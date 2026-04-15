package smtptransient

import (
	"errors"
	"net"
	"regexp"
	"strings"
)

const DefaultRetries = 3

var transientSMTPCodeRe = regexp.MustCompile(`(?:^|\n|\s)([45]\d{2})\s`)

func IsTransient(err error) bool {
	if err == nil {
		return false
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	msg := err.Error()
	if strings.Contains(msg, "smtp dial:") ||
		strings.Contains(msg, "smtp starttls:") ||
		strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "i/o timeout") {
		return true
	}
	matches := transientSMTPCodeRe.FindAllStringSubmatch(msg, -1)
	for _, m := range matches {
		code := m[1]
		c := code[0]
		if c == '5' || c == '4' {
			return true
		}
	}
	return false
}
