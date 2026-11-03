package api

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// I-2: a part whose body takes longer than the server's WriteTimeout must
// still get its 204 (the handler extends the write deadline too).
func TestSlowPartOutlastsServerWriteTimeout(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	data := randBytes(10)
	rec := e.call(http.MethodPost, "/v1/uploads", o.token, map[string]any{"size": 10, "sha256": shaHex(data)})
	var up uploadJSON
	decodeInto(t, rec, &up)

	srv := httptest.NewUnstartedServer(e.router)
	srv.Config.WriteTimeout = 300 * time.Millisecond
	srv.Config.ReadTimeout = 300 * time.Millisecond
	srv.Start()
	defer srv.Close()

	pr, pw := io.Pipe()
	go func() {
		_, _ = pw.Write(data[:5])
		time.Sleep(700 * time.Millisecond)
		_, _ = pw.Write(data[5:])
		_ = pw.Close()
	}()
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/v1/uploads/%s/parts/0", srv.URL, up.ID), pr)
	req.ContentLength = 10
	req.Header.Set("Authorization", "Bearer "+o.token)
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("slow part: %v (the box stored it but the reply was lost)", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("slow part status = %d, want 204", resp.StatusCode)
	}
}
