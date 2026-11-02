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
    Path            string // where it is mounted; blobs live under it
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

// Clock is the box's time source. Trash purge, upload expiry and sessions
// read it, so the simulator can move time forward.
type Clock interface {
    Now() time.Time
}

type HAL struct {
    Light   StatusLight
    Button  PowerButton
    Drives  Drives
    Modules Modules
    Clock   Clock
}
```

## Implementations

| Interface | `sim` (laptop) | `pi` (Raspberry Pi 5) |
|-----------|----------------|------------------------|
| StatusLight | Logs and shows state on a dev page | RGB LED on 3 GPIO pins (periph.io) |
| PowerButton | Button on the dev page | Pi 5 power button events / GPIO |
| Drives | Folders under `./.data`, fake sizes and SMART values | `lsblk`, `statfs`, `smartctl -j` |
| Modules | Attach/detach/forge buttons on the dev page (M9; until then "no module") | DETECT on GPIO17; ATECC608 over I2C at 0x60 |
| Clock | Real time plus an offset the dev API moves forward | System clock |

On the laptop the main drive is the data directory and the backup drive is
`<data>/sim-backup` (1 TB and 2 TB, 10 % full by default). An unplugged drive
is simply not listed.

Pick at startup: `boxd --hal=sim` (default on non-arm64) or `--hal=pi`
(default on arm64).

Until the `pi` implementation lands in M5, `--hal=pi` exits with "pi HAL is not
implemented yet (milestone M5)". On an arm64 machine before M5, pass
`--hal=sim` explicitly. **Open question for M5:** keep `pi` as the arm64
default (fails loudly on a Pi build without hardware access) or always default
to `sim` and require `--hal=pi` in the systemd unit (doc 09 already passes it).

## Simulator dev page

Only built with the Go build tag `sim` (`go build -tags sim`). `make dev`,
`make test` and CI use the tag; `make build-pi` does not, so a real box never
serves these controls (they could, for example, move the clock forward and
purge Trash). Served at `/dev/sim`:

- Status light preview
- Press power button (short / long)
- Fill main drive to 95%, unplug backup drive, report a failing drive
- Attach a genuine module, attach a forged module, detach
- Freeze the clock forward 31 days (tests Trash purge)

These same controls are exposed as an HTTP API (no auth, dev builds only) so
Playwright and Go integration tests can drive failure cases:

| Method | Path | Body | Does |
|--------|------|------|------|
| GET | `/dev/sim/state` | | Light, clock offset, drives |
| POST | `/dev/sim/button` | `{"kind": "short"\|"long"}` | Press the power button |
| POST | `/dev/sim/drives/{role}` | `{"present": bool, "fillPercent": 0-100}` | Unplug/plug, fill a drive |
| POST | `/dev/sim/clock/advance` | `{"seconds": n}` | Move the clock forward |
| POST | `/dev/sim/jobs/{name}` | | Run `replicate`, `purge`, `cleanup` or `light` now |

The HTML page arrives with the web app in M2; M1 has the API only.

## Open question: ATECC608 from Go

There is no well-maintained pure-Go ATECC608 driver. Options:
1. Call Microchip's cryptoauthlib through cgo (complicates cross-compiling).
2. Small Python helper using Adafruit's CircuitPython library, called by `boxd`.
3. Implement the few I2C commands needed (Random, Sign, Info) in Go.

Not needed for the gift build (no module). Decide before milestone M9.
