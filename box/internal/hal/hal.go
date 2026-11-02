// Package hal is the only way boxd touches hardware (docs/06). Every
// interface has a sim implementation (laptop) and, from M5, a pi one.
package hal

import (
	"context"
	"errors"
	"time"
)

// LightState is what the status light shows.
type LightState int

const (
	Off LightState = iota
	SafeSteady
	BusyPulse
	Attention
	Fault
)

func (s LightState) String() string {
	switch s {
	case Off:
		return "off"
	case SafeSteady:
		return "safe"
	case BusyPulse:
		return "busy"
	case Attention:
		return "attention"
	case Fault:
		return "fault"
	}
	return "unknown"
}

// StatusLight drives the box's status light.
type StatusLight interface {
	Set(state LightState) error
}

// PressKind is a short or long press of the power button.
type PressKind int

const (
	ShortPress PressKind = iota
	LongPress
)

// PressEvent is one power button press.
type PressEvent struct {
	Kind PressKind
	At   time.Time
}

// PowerButton reports presses of the power button.
type PowerButton interface {
	Presses() <-chan PressEvent
}

// Drive roles.
const (
	RoleMain   = "main"
	RoleBackup = "backup"
)

// Drive is one attached storage drive. Path is where it is mounted.
type Drive struct {
	ID, Role, Model, Path string
	SizeBytes, FreeBytes  uint64
}

// DriveHealth is a SMART summary.
type DriveHealth struct {
	OK           bool
	TemperatureC int
}

// Drives lists attached drives. A drive that is unplugged is not listed.
type Drives interface {
	List(ctx context.Context) ([]Drive, error)
	Health(ctx context.Context, id string) (DriveHealth, error)
}

// ModuleEvent reports a module attached to or removed from a slot.
type ModuleEvent struct {
	Slot     int
	Attached bool
}

// ModuleIdentity is a verified module's identity.
type ModuleIdentity struct {
	Serial string
}

// Modules detects and verifies expansion modules (M9).
type Modules interface {
	Events() <-chan ModuleEvent
	// Verify runs the challenge-response with the module's secure element.
	Verify(ctx context.Context, slot int) (ModuleIdentity, error)
}

// Clock is the box's time source; the simulator can move it forward.
type Clock interface {
	Now() time.Time
}

// HAL bundles every hardware interface.
type HAL struct {
	Light   StatusLight
	Button  PowerButton
	Drives  Drives
	Modules Modules
	Clock   Clock
}

var (
	// ErrDriveMissing means no drive with the requested role is attached.
	ErrDriveMissing = errors.New("drive missing")
	// ErrNoModule means no module is attached in the slot.
	ErrNoModule = errors.New("no module in slot")
)

// Drive returns the attached drive with the given role, or ErrDriveMissing.
func (h HAL) Drive(ctx context.Context, role string) (Drive, error) {
	list, err := h.Drives.List(ctx)
	if err != nil {
		return Drive{}, err
	}
	for _, d := range list {
		if d.Role == role {
			return d, nil
		}
	}
	return Drive{}, ErrDriveMissing
}
