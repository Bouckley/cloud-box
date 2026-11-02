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
	"github.com/Bouckley/cloud-box/box/internal/config"
	"github.com/Bouckley/cloud-box/box/internal/devcert"
)

const shutdownTimeout = 10 * time.Second

// Server is a configured boxd HTTPS server.
type Server struct {
	http        *http.Server
	fingerprint string
	logger      *slog.Logger
}

// New prepares the data directory and TLS certificate and builds the server.
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

	return &Server{
		http: &http.Server{
			Addr:              cfg.Addr,
			Handler:           api.NewRouter(version),
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

// Serve accepts TLS connections on ln until ctx is cancelled, then shuts down
// gracefully. It returns nil after a clean shutdown.
func (s *Server) Serve(ctx context.Context, ln net.Listener) error {
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
