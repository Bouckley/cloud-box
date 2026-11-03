package api

import (
	"net/http"
	"strings"
	"testing"
)

type infoJSON struct {
	SetUp     bool   `json:"setUp"`
	SetupOpen bool   `json:"setupOpen"`
	Version   string `json:"version"`
}

func TestInfo(t *testing.T) {
	e := newEnvNoPress(t)
	get := func() infoJSON {
		t.Helper()
		rec := e.call(http.MethodGet, "/v1/info", "", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /v1/info = %d: %s", rec.Code, rec.Body)
		}
		var got infoJSON
		decodeInto(t, rec, &got)
		return got
	}
	if got := get(); got != (infoJSON{SetUp: false, SetupOpen: false, Version: "test"}) {
		t.Errorf("fresh info = %+v", got)
	}
	e.deps.Auth.OpenSetupWindow(e.sim.HAL().Clock.Now())
	if got := get(); !got.SetupOpen || got.SetUp {
		t.Errorf("after press info = %+v, want setupOpen", got)
	}
	if rec := e.call(http.MethodPost, "/v1/setup", "", setupBody(randBytes(32))); rec.Code != http.StatusCreated {
		t.Fatalf("setup = %d: %s", rec.Code, rec.Body)
	}
	if got := get(); !got.SetUp || got.SetupOpen {
		t.Errorf("after setup info = %+v, want setUp and closed", got)
	}
}

func TestSetupPressButtonError(t *testing.T) {
	e := newEnvNoPress(t)
	rec := e.call(http.MethodPost, "/v1/setup", "", setupBody(randBytes(32)))
	if rec.Code != http.StatusConflict {
		t.Fatalf("setup without press = %d, want 409: %s", rec.Code, rec.Body)
	}
	var body apiError
	decodeInto(t, rec, &body)
	if body.Code != "press_button" || !strings.Contains(body.Action, "Press the button on the front of your box") {
		t.Errorf("error = %+v", body)
	}
}

func TestSetupNeedsRecoveryKey(t *testing.T) {
	for name, val := range map[string]any{"missing": nil, "31 bytes": randBytes(31), "33 bytes": randBytes(33)} {
		t.Run(name, func(t *testing.T) {
			e := newEnv(t)
			b := setupBody(randBytes(32))
			u := b["user"].(map[string]any)
			if val == nil {
				delete(u, "recoveryPublicKey")
			} else {
				u["recoveryPublicKey"] = val
			}
			if rec := e.call(http.MethodPost, "/v1/setup", "", b); rec.Code != http.StatusBadRequest {
				t.Errorf("setup = %d, want 400: %s", rec.Code, rec.Body)
			}
		})
	}
}
