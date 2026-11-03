// Package sim simulates the box's hardware on a laptop. The main drive is the
// data directory; the backup drive is <data>/sim-backup. Tests and the
// /dev/sim API (built with -tags sim) drive failure cases through it.
package sim

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/hal"
)

const (
	mainSize    uint64 = 1_000_000_000_000 // 1 TB
	backupSize  uint64 = 2_000_000_000_000 // 2 TB
	defaultFill        = 10
	pressBuffer        = 8
)

// Sim is the simulated hardware. It is safe for concurrent use.
type Sim struct {
	dataDir    string
	backupPath string
	presses    chan hal.PressEvent
	modules    chan hal.ModuleEvent

	mu            sync.Mutex
	light         hal.LightState
	backupPresent bool
	fill          map[string]int
	offset        time.Duration
}

// New returns a simulator rooted at dataDir. It creates the backup folder.
func New(dataDir string) *Sim {
	s := &Sim{
		dataDir:       dataDir,
		backupPath:    filepath.Join(dataDir, "sim-backup"),
		presses:       make(chan hal.PressEvent, pressBuffer),
		modules:       make(chan hal.ModuleEvent),
		backupPresent: true,
		fill:          map[string]int{hal.RoleMain: defaultFill, hal.RoleBackup: defaultFill},
	}
	_ = os.MkdirAll(s.backupPath, 0o700)
	return s
}

// HAL returns the simulator as a hal.HAL.
func (s *Sim) HAL() hal.HAL {
	return hal.HAL{
		Light:   (*light)(s),
		Button:  (*button)(s),
		Drives:  (*drives)(s),
		Modules: (*modules)(s),
		Clock:   (*clock)(s),
	}
}

// Light returns the current light state.
func (s *Sim) Light() hal.LightState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.light
}

// Press simulates a power button press. It never blocks: when nobody reads
// and the buffer is full, the press is dropped.
func (s *Sim) Press(kind hal.PressKind) {
	select {
	case s.presses <- hal.PressEvent{Kind: kind, At: s.now()}:
	default:
	}
}

// SetBackupPresent plugs in or unplugs the backup drive.
func (s *Sim) SetBackupPresent(present bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.backupPresent = present
	if present {
		_ = os.MkdirAll(s.backupPath, 0o700)
	}
}

// SetFill sets how full a drive is, in percent (0–100).
func (s *Sim) SetFill(role string, percent int) error {
	if role != hal.RoleMain && role != hal.RoleBackup {
		return fmt.Errorf("unknown drive role %q", role)
	}
	if percent < 0 || percent > 100 {
		return fmt.Errorf("fill %d%% out of range 0–100", percent)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.fill[role] = percent
	return nil
}

// Advance moves the simulated clock forward.
func (s *Sim) Advance(d time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.offset += d
}

// ClockOffset is how far the simulated clock is ahead of real time.
func (s *Sim) ClockOffset() time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.offset
}

func (s *Sim) now() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return time.Now().Add(s.offset)
}

type light Sim

func (l *light) Set(state hal.LightState) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.light = state
	return nil
}

type button Sim

func (b *button) Presses() <-chan hal.PressEvent { return b.presses }

type drives Sim

func (d *drives) List(context.Context) ([]hal.Drive, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	list := []hal.Drive{d.drive(hal.RoleMain, "sim-main", d.dataDir, mainSize)}
	if d.backupPresent {
		list = append(list, d.drive(hal.RoleBackup, "sim-backup", d.backupPath, backupSize))
	}
	return list, nil
}

// drive builds a Drive; the caller holds d.mu.
func (d *drives) drive(role, id, path string, size uint64) hal.Drive {
	return hal.Drive{
		ID: id, Role: role, Model: "Simulated SSD", Path: path,
		SizeBytes: size, FreeBytes: size / 100 * uint64(100-d.fill[role]),
	}
}

func (d *drives) Health(ctx context.Context, id string) (hal.DriveHealth, error) {
	list, _ := d.List(ctx)
	for _, drv := range list {
		if drv.ID == id {
			return hal.DriveHealth{OK: true, TemperatureC: 35}, nil
		}
	}
	return hal.DriveHealth{}, hal.ErrDriveMissing
}

type modules Sim

func (m *modules) Events() <-chan hal.ModuleEvent { return m.modules }

func (m *modules) Verify(context.Context, int) (hal.ModuleIdentity, error) {
	return hal.ModuleIdentity{}, hal.ErrNoModule
}

type clock Sim

func (c *clock) Now() time.Time { return (*Sim)(c).now() }
