package api

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testLogger() (*slog.Logger, *bytes.Buffer) {
	var buf bytes.Buffer
	return slog.New(slog.NewTextHandler(&buf, nil)), &buf
}

func TestLogLineHasNoSecrets(t *testing.T) {
	logger, buf := testLogger()
	h := NewRouter(Deps{Version: "test", Logger: logger})
	req := httptest.NewRequest(http.MethodGet, "/v1/health?since=SECRETQ", nil)
	req.Header.Set("Authorization", "Bearer SECRETTOKEN")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	line := buf.String()
	for _, want := range []string{"method=GET", `route="GET /v1/health"`, "status=200", "duration_ms="} {
		if !strings.Contains(line, want) {
			t.Errorf("log %q missing %q", line, want)
		}
	}
	for _, secret := range []string{"SECRETTOKEN", "SECRETQ", "Bearer"} {
		if strings.Contains(line, secret) {
			t.Errorf("log %q contains %q", line, secret)
		}
	}
}

func TestLogUnmatchedRoute(t *testing.T) {
	logger, buf := testLogger()
	rec := httptest.NewRecorder()
	NewRouter(Deps{Version: "test", Logger: logger}).
		ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/nope/SECRETPATH", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
	if line := buf.String(); !strings.Contains(line, "route=unmatched") || strings.Contains(line, "SECRETPATH") {
		t.Errorf("log %q: want route=unmatched and no raw path", line)
	}
}

func TestRecoverReturns500(t *testing.T) {
	logger, buf := testLogger()
	h := withLogging(logger, withRecover(logger, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("PANICVALUE key=00ff")
	})))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body["code"] != "internal_error" {
		t.Fatalf("body = %q (%v), want internal_error", rec.Body.String(), err)
	}
	if strings.Contains(rec.Body.String(), "PANICVALUE") {
		t.Error("panic value leaked into the response")
	}
	if strings.Contains(buf.String(), "PANICVALUE") {
		t.Error("panic value written to the log")
	}
	if n := strings.Count(buf.String(), "level=ERROR"); n != 1 {
		t.Errorf("error log lines = %d, want 1:\n%s", n, buf.String())
	}
}
