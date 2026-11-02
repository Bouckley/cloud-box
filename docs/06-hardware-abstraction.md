# 6. Hardware abstraction (HAL)

Everything that touches the Pi's hardware sits behind a Go interface with two
implementations: `sim` for the laptop and `pi` for the real box. The server
code can't tell them apart.

## Interfaces

```go
package hal

type LightState int // Off, SafeSteady, BusyPulse, Attention, Fault

type StatusLight interface {
    Set(state LightState) error
}

type PowerButton interface {
    Presses() <-chan PressEvent // short press, long press
}

type Drive struct {
    ID, Role, Model string // Role: "main" or "backup"
    SizeBytes, FreeBytes uint64
}

type Drives interface {
    List(ctx context.Context) ([]Drive, error)
    Health(ctx context.Context, id string) (DriveHealth, error) // SMART summary
}

type ModuleEvent struct{ Slot int; Attached bool }

type Modules interface {
    Events() <-chan ModuleEvent
    // Verify runs the challenge-response with the module's secure element.
    Verify(ctx context.Context, slot int) (ModuleIdentity, error)
}

type HAL struct {
    Light   StatusLight
    Button  PowerButton
    Drives  Drives
    Modules Modules
}
```

## Implementations

| Interface | `sim` (laptop) | `pi` (Raspberry Pi 5) |
|-----------|----------------|------------------------|
| StatusLight | Logs and shows state on a dev page | RGB LED on 3 GPIO pins (periph.io) |
| PowerButton | Button on the dev page | Pi 5 power button events / GPIO |
| Drives | Folders under `./.data`, fake sizes and SMART values | `lsblk`, `statfs`, `smartctl -j` |
| Modules | Attach/detach/forge buttons on the dev page | DETECT on GPIO17; ATECC608 over I2C at 0x60 |

Pick at startup: `boxd --hal=sim` (default on non-arm64) or `--hal=pi`.

## Simulator dev page

Only built with the `sim` build tag, served at `/dev/sim`:

- Status light preview
- Press power button (short / long)
- Fill main drive to 95%, unplug backup drive, report a failing drive
- Attach a genuine module, attach a forged module, detach
- Freeze the clock forward 31 days (tests Trash purge)

These same controls are exposed as an HTTP API so Playwright and Go
integration tests can drive failure cases.

## Open question: ATECC608 from Go

There is no well-maintained pure-Go ATECC608 driver. Options:
1. Call Microchip's cryptoauthlib through cgo (complicates cross-compiling).
2. Small Python helper using Adafruit's CircuitPython library, called by `boxd`.
3. Implement the few I2C commands needed (Random, Sign, Info) in Go.

Not needed for the gift build (no module). Decide before milestone M9.
