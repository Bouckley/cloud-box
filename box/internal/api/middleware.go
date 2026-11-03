package api

import (
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"
)

// withLogging logs one line per request: method, route pattern, status,
// duration and bytes written. It never logs headers, the query string, the
// raw path or the body, so tokens, codes and ciphertext stay out of logs.
func withLogging(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		route := r.Pattern
		if route == "" {
			route = "unmatched"
		}
		logger.Info("request",
			"method", r.Method,
			"route", route,
			"status", sw.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"bytes", sw.bytes,
		)
	})
}

// withRecover turns a handler panic into a 500 internal_error. The panic
// value is not logged or returned, since it could hold request data; the
// stack is logged to find the bug.
func withRecover(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			v := recover()
			if v == nil {
				return
			}
			if v == http.ErrAbortHandler {
				panic(v)
			}
			logger.Error("handler panic", "route", r.Pattern, "stack", string(debug.Stack()))
			writeError(w, http.StatusInternalServerError, apiError{
				Code:    "internal_error",
				Message: "Something went wrong on the box.",
				Action:  "Try again. If it keeps happening, restart the box.",
			})
		}()
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status      int
	bytes       int64
	wroteHeader bool
}

func (s *statusWriter) WriteHeader(status int) {
	if !s.wroteHeader {
		s.status = status
		s.wroteHeader = true
	}
	s.ResponseWriter.WriteHeader(status)
}

func (s *statusWriter) Write(b []byte) (int, error) {
	s.wroteHeader = true
	n, err := s.ResponseWriter.Write(b)
	s.bytes += int64(n)
	return n, err
}

// Unwrap lets http.ResponseController reach the underlying writer
// (per-route deadlines, flushing).
func (s *statusWriter) Unwrap() http.ResponseWriter { return s.ResponseWriter }
