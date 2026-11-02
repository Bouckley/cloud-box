// Package config parses boxd's command-line flags.
package config

import (
	"errors"
	"flag"
	"fmt"
	"io"
)

// HALKind selects the hardware abstraction implementation.
type HALKind string

const (
	HALSim HALKind = "sim" // laptop simulation
	HALPi  HALKind = "pi"  // Raspberry Pi 5 drivers
)

// Config is boxd's runtime configuration.
type Config struct {
	HAL     HALKind
	DataDir string
	Addr    string
}

// Parse reads boxd flags from args. goarch decides the default HAL:
// "pi" on arm64, "sim" everywhere else (docs/06-hardware-abstraction.md).
func Parse(args []string, goarch string) (Config, error) {
	defaultHAL := HALSim
	if goarch == "arm64" {
		defaultHAL = HALPi
	}

	fs := flag.NewFlagSet("boxd", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	hal := fs.String("hal", string(defaultHAL), "hardware implementation: sim or pi")
	data := fs.String("data", "./.data", "data directory")
	addr := fs.String("addr", ":8443", "HTTPS listen address")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}

	cfg := Config{HAL: HALKind(*hal), DataDir: *data, Addr: *addr}
	switch cfg.HAL {
	case HALSim, HALPi:
	default:
		return Config{}, fmt.Errorf("unknown --hal %q: use %q or %q", *hal, HALSim, HALPi)
	}
	if cfg.DataDir == "" {
		return Config{}, errors.New("--data must not be empty")
	}
	return cfg, nil
}
