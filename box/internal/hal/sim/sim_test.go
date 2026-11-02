package sim

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/hal"
)

func newSim(t *testing.T) (*Sim, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "with space")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	return New(dir), dir
}

func listDrives(t *testing.T, s *Sim) map[string]hal.Drive {
	t.Helper()
	list, err := s.HAL().Drives.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	m := map[string]hal.Drive{}
	for _, d := range list {
		m[d.Role] = d
	}
	return m
}

func TestDrivesDefault(t *testing.T) {
	s, dir := newSim(t)
	d := listDrives(t, s)
	if len(d) != 2 {
		t.Fatalf("drives = %v, want main and backup", d)
	}
	main, backup := d["main"], d["backup"]
	if main.Path != dir {
		t.Errorf("main path = %q, want %q", main.Path, dir)
	}
	if !strings.HasSuffix(backup.Path, "sim-backup") {
		t.Errorf("backup path = %q, want …/sim-backup", backup.Path)
	}
	for _, drv := range d {
		if drv.FreeBytes != drv.SizeBytes/10*9 {
			t.Errorf("%s free = %d, want 90%% of %d", drv.Role, drv.FreeBytes, drv.SizeBytes)
		}
		if drv.ID == "" || drv.Model == "" {
			t.Errorf("%s missing id or model: %+v", drv.Role, drv)
		}
	}
	fi, err := os.Stat(backup.Path)
	if err != nil {
		t.Fatalf("backup dir: %v", err)
	}
	if fi.Mode().Perm() != 0o700 {
		t.Errorf("backup dir mode = %v, want 0700", fi.Mode().Perm())
	}
}

func TestBackupUnplugged(t *testing.T) {
	s, _ := newSim(t)
	s.SetBackupPresent(false)
	d := listDrives(t, s)
	if _, ok := d["backup"]; ok || len(d) != 1 {
		t.Fatalf("drives = %v, want main only", d)
	}
	if _, err := s.HAL().Drive(context.Background(), "backup"); !errors.Is(err, hal.ErrDriveMissing) {
		t.Errorf("Drive(backup) error = %v, want ErrDriveMissing", err)
	}
	s.SetBackupPresent(true)
	if _, err := s.HAL().Drive(context.Background(), "backup"); err != nil {
		t.Errorf("Drive(backup) after replug: %v", err)
	}
}

func TestSetFill(t *testing.T) {
	s, _ := newSim(t)
	if err := s.SetFill("main", 95); err != nil {
		t.Fatal(err)
	}
	main := listDrives(t, s)["main"]
	if main.FreeBytes != main.SizeBytes/100*5 {
		t.Errorf("free = %d, want 5%% of %d", main.FreeBytes, main.SizeBytes)
	}
	if err := s.SetFill("main", 101); err == nil {
		t.Error("SetFill(main, 101) succeeded")
	}
	if err := s.SetFill("main", -1); err == nil {
		t.Error("SetFill(main, -1) succeeded")
	}
	if err := s.SetFill("tape", 5); err == nil {
		t.Error("SetFill(tape) succeeded")
	}
}

func TestClockAdvance(t *testing.T) {
	s, _ := newSim(t)
	clock := s.HAL().Clock
	before := clock.Now()
	s.Advance(31 * 24 * time.Hour)
	if got := clock.Now().Sub(before); got < 31*24*time.Hour {
		t.Errorf("clock moved %v, want ≥ 31 days", got)
	}
	if s.ClockOffset() != 31*24*time.Hour {
		t.Errorf("ClockOffset = %v", s.ClockOffset())
	}
}

func TestLightAndButton(t *testing.T) {
	s, _ := newSim(t)
	if s.Light() != hal.Off {
		t.Errorf("initial light = %v, want off", s.Light())
	}
	if err := s.HAL().Light.Set(hal.Attention); err != nil {
		t.Fatal(err)
	}
	if s.Light() != hal.Attention || s.Light().String() != "attention" {
		t.Errorf("light = %v, want attention", s.Light())
	}

	s.Press(hal.ShortPress)
	select {
	case ev := <-s.HAL().Button.Presses():
		if ev.Kind != hal.ShortPress || ev.At.IsZero() {
			t.Errorf("event = %+v", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("no press event")
	}

	// Nobody reading: presses must not block once the buffer is full.
	done := make(chan struct{})
	go func() {
		for range 100 {
			s.Press(hal.LongPress)
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Press blocked with no reader")
	}
}

func TestModulesNone(t *testing.T) {
	s, _ := newSim(t)
	if _, err := s.HAL().Modules.Verify(context.Background(), 0); !errors.Is(err, hal.ErrNoModule) {
		t.Errorf("Verify error = %v, want ErrNoModule", err)
	}
}

func TestLightStateStrings(t *testing.T) {
	want := map[hal.LightState]string{
		hal.Off: "off", hal.SafeSteady: "safe", hal.BusyPulse: "busy",
		hal.Attention: "attention", hal.Fault: "fault",
	}
	for st, w := range want {
		if st.String() != w {
			t.Errorf("%d.String() = %q, want %q", st, st.String(), w)
		}
	}
}
