// Command boxd is the Cloud Box server.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/Bouckley/cloud-box/box/internal/config"
	"github.com/Bouckley/cloud-box/box/internal/server"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(os.Stderr, "usage: boxd [--hal=sim|pi] [--data=DIR] [--addr=HOST:PORT]")
			os.Exit(0)
		}
		fmt.Fprintln(os.Stderr, "boxd:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Parse(os.Args[1:], runtime.GOARCH)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	srv, err := server.New(cfg, version, logger)
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	logger.Info("boxd listening",
		"addr", "https://"+ln.Addr().String(),
		"hal", cfg.HAL,
		"version", version,
		"cert_sha256", srv.Fingerprint(),
	)
	err = srv.Serve(ctx, ln)
	logger.Info("boxd stopped")
	return err
}
