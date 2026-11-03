//go:build sim

package api

import (
	"net/http"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/hal"
)

type simState struct {
	Light              string `json:"light"`
	ClockOffsetSeconds int64  `json:"clockOffsetSeconds"`
	Drives             []struct {
		Role      string `json:"role"`
		SizeBytes uint64 `json:"sizeBytes"`
		FreeBytes uint64 `json:"freeBytes"`
	} `json:"drives"`
}

func (e *env) simState() simState {
	e.t.Helper()
	rec := e.call(http.MethodGet, "/dev/sim/state", "", nil)
	if rec.Code != http.StatusOK {
		e.t.Fatalf("state = %d %s", rec.Code, rec.Body)
	}
	var s simState
	decodeInto(e.t, rec, &s)
	return s
}

func TestDevSim(t *testing.T) {
	e := newEnv(t)
	if s := e.simState(); s.Light != "off" || len(s.Drives) != 2 || s.ClockOffsetSeconds != 0 {
		t.Errorf("initial state = %+v", s)
	}
	if rec := e.call(http.MethodPost, "/dev/sim/clock/advance", "", map[string]any{"seconds": 90000}); rec.Code != http.StatusOK {
		t.Fatalf("advance = %d %s", rec.Code, rec.Body)
	}
	if s := e.simState(); s.ClockOffsetSeconds < 90000 {
		t.Errorf("clock offset = %d, want ≥ 90000", s.ClockOffsetSeconds)
	}
	if rec := e.call(http.MethodPost, "/dev/sim/drives/backup", "", map[string]any{"present": false}); rec.Code != http.StatusOK {
		t.Fatalf("unplug = %d %s", rec.Code, rec.Body)
	}
	if s := e.simState(); len(s.Drives) != 1 || s.Drives[0].Role != "main" {
		t.Errorf("drives after unplug = %+v", s.Drives)
	}
	_ = e.call(http.MethodPost, "/dev/sim/drives/backup", "", map[string]any{"present": true})
	if rec := e.call(http.MethodPost, "/dev/sim/drives/main", "", map[string]any{"fillPercent": 95}); rec.Code != http.StatusOK {
		t.Fatalf("fill = %d %s", rec.Code, rec.Body)
	}
	for _, d := range e.simState().Drives {
		if d.Role == "main" && d.FreeBytes != d.SizeBytes/100*5 {
			t.Errorf("main free = %d of %d, want 5%%", d.FreeBytes, d.SizeBytes)
		}
	}

	rec := e.call(http.MethodPost, "/dev/sim/jobs/replicate", "", nil)
	var res map[string]any
	decodeInto(t, rec, &res)
	if rec.Code != http.StatusOK || res["copied"] == nil {
		t.Errorf("replicate job = %d %v", rec.Code, res)
	}
	if rec := e.call(http.MethodPost, "/dev/sim/jobs/light", "", nil); rec.Code != http.StatusOK {
		t.Errorf("light job = %d", rec.Code)
	}
	if s := e.simState(); s.Light != "attention" { // main is 95% full
		t.Errorf("light = %s, want attention", s.Light)
	}

	if rec := e.call(http.MethodPost, "/dev/sim/button", "", map[string]any{"kind": "long"}); rec.Code != http.StatusOK {
		t.Fatalf("button = %d %s", rec.Code, rec.Body)
	}
	select {
	case ev := <-e.sim.HAL().Button.Presses():
		if ev.Kind != hal.LongPress {
			t.Errorf("press = %+v", ev)
		}
	case <-time.After(time.Second):
		t.Error("no press")
	}
}

func TestDevSimBadRequests(t *testing.T) {
	e := newEnv(t)
	for _, c := range []struct {
		path string
		body any
		want int
	}{
		{"/dev/sim/jobs/defrag", nil, http.StatusNotFound},
		{"/dev/sim/drives/tape", map[string]any{"present": false}, http.StatusBadRequest},
		{"/dev/sim/drives/main", map[string]any{"present": false}, http.StatusBadRequest},
		{"/dev/sim/drives/main", map[string]any{"fillPercent": 101}, http.StatusBadRequest},
		{"/dev/sim/drives/backup", map[string]any{}, http.StatusBadRequest},
		{"/dev/sim/button", map[string]any{"kind": "double"}, http.StatusBadRequest},
		{"/dev/sim/clock/advance", map[string]any{"seconds": -5}, http.StatusBadRequest},
	} {
		if rec := e.call(http.MethodPost, c.path, "", c.body); rec.Code != c.want {
			t.Errorf("%s %v = %d, want %d", c.path, c.body, rec.Code, c.want)
		}
	}
}
