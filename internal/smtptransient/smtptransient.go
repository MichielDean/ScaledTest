package smtptransient

import (
	"errors"
	"net"
	"strings"
)

const DefaultRetries = 3

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
	if strings.Contains(msg, "55") || strings.Contains(msg, "54") ||
		strings.Contains(msg, "451") || strings.Contains(msg, "452") ||
		strings.Contains(msg, "421") {
		return true
	}
	return false
}
