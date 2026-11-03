// Package server runs boxd's HTTPS listener.
package server

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/api"
	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/config"
	"github.com/Bouckley/cloud-box/box/internal/devcert"
	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/jobs"
	"github.com/Bouckley/cloud-box/box/internal/library"
	"github.com/Bouckley/cloud-box/box/internal/replica"
	"github.com/Bouckley/cloud-box/box/internal/status"
	"github.com/Bouckley/cloud-box/box/internal/store"
	"github.com/Bouckley/cloud-box/box/internal/trash"
	"github.com/Bouckley/cloud-box/box/web"
)

const shutdownTimeout = 10 * time.Second

// Server is a configured boxd HTTPS server.
type Server struct {
	http        *http.Server
	fingerprint string
	logger      *slog.Logger
	db          *store.Store
	jobs        *jobs.Runner
	auth        *auth.Service
	hal         hal.HAL
}

// New prepares the data directory, TLS certificate and database, builds
// every service on the simulated hardware (the Pi HAL arrives in M5) and
// the background jobs.
func New(cfg config.Config, version string, logger *slog.Logger) (*Server, error) {
	if cfg.HAL == config.HALPi {
		return nil, errors.New("pi HAL is not implemented yet (milestone M5)")
	}
	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	hosts := []string{"cloudbox.local"}
	if h, err := os.Hostname(); err == nil && h != "" {
		hosts = append(hosts, h)
	}
	cert, err := devcert.LoadOrCreate(filepath.Join(cfg.DataDir, "tls"), hosts, time.Now())
	if err != nil {
		return nil, err
	}
	db, err := store.Open(context.Background(), filepath.Join(cfg.DataDir, "db", "box.sqlite"))
	if err != nil {
		return nil, err
	}

	hw := sim.New(cfg.DataDir)
	h := hw.HAL()
	authSvc := auth.New(db, h.Clock)
	blobSvc := blobs.New(db, h)
	lib := library.New(db, h.Clock)
	rep := replica.New(db, h)
	trashSvc := trash.New(db, h, blobSvc)
	st := status.New(db, h, lib, rep)
	runner := &jobs.Runner{
		Replicate: func(ctx context.Context) (any, error) { return rep.Run(ctx) },
		Purge: func(ctx context.Context) (any, error) {
			n, err := trashSvc.Purge(ctx)
			return map[string]int{"purged": n}, err
		},
		Cleanup: func(ctx context.Context) (any, error) {
			uploads, err := blobSvc.CleanupUploads(ctx)
			if err != nil {
				return nil, err
			}
			sessions, err := authSvc.Cleanup(ctx)
			return map[string]int{"uploads": uploads, "auth": sessions}, err
		},
		Light: func(ctx context.Context) (any, error) {
			if err := st.UpdateLight(ctx); err != nil {
				return nil, err
			}
			return map[string]string{"light": hw.Light().String()}, nil
		},
		Logger: logger,
	}
	deps := api.Deps{
		Version: version, Logger: logger, Auth: authSvc, Blobs: blobSvc, Library: lib,
		Trash: trashSvc, Status: st, Sim: hw, Jobs: runner, Web: web.Handler(),
	}

	return &Server{
		db:   db,
		jobs: runner,
		auth: authSvc,
		hal:  h,
		http: &http.Server{
			Addr:              cfg.Addr,
			Handler:           api.NewRouter(deps),
			TLSConfig:         &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS13},
			ReadHeaderTimeout: 10 * time.Second,
			ReadTimeout:       60 * time.Second,
			WriteTimeout:      60 * time.Second,
			IdleTimeout:       120 * time.Second,
			ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
		},
		fingerprint: devcert.Fingerprint(cert),
		logger:      logger,
	}, nil
}

// Fingerprint is the SHA-256 fingerprint apps pin (lowercase hex).
func (s *Server) Fingerprint() string { return s.fingerprint }

// Serve accepts TLS connections on ln and runs the background jobs until ctx
// is cancelled, then shuts down gracefully and closes the database. It
// returns nil after a clean shutdown.
func (s *Server) Serve(ctx context.Context, ln net.Listener) error {
	defer s.db.Close()
	jobsCtx, stopJobs := context.WithCancel(ctx)
	jobsDone := make(chan struct{})
	go func() { s.jobs.Run(jobsCtx); close(jobsDone) }()
	buttonDone := make(chan struct{})
	go func() { s.watchButton(jobsCtx); close(buttonDone) }()
	defer func() { stopJobs(); <-jobsDone; <-buttonDone }()

	errc := make(chan error, 1)
	go func() { errc <- s.http.Serve(tls.NewListener(ln, s.http.TLSConfig)) }()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := s.http.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-errc; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// watchButton opens the setup window on each short press of the power button
// until ctx ends. Long presses are for shutdown (M5) and ignored here.
func (s *Server) watchButton(ctx context.Context) {
	presses := s.hal.Button.Presses()
	for {
		select {
		case <-ctx.Done():
			return
		case p := <-presses:
			if p.Kind == hal.ShortPress {
				s.auth.OpenSetupWindow(s.hal.Clock.Now())
				s.logger.Info("setup window opened by button press")
			}
		}
	}
}
