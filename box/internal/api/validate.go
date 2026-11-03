package api

import "fmt"

// validID reports whether s is an id: 32 lowercase hex characters (ADR 0003).
func validID(s string) bool { return validHex(s, 16) }

// validHex reports whether s is exactly n bytes as lowercase hex.
func validHex(s string, n int) bool {
	if len(s) != 2*n {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// checkLen checks a ciphertext field's length in bytes (the box can check
// sizes, never contents). The error names the field, not its value.
func checkLen(field string, b []byte, min, max int) error {
	if len(b) < min || len(b) > max {
		if min == max {
			return fmt.Errorf("%s must be %d bytes", field, min)
		}
		return fmt.Errorf("%s must be %d to %d bytes", field, min, max)
	}
	return nil
}
