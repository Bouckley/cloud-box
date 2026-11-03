// Package jobs runs boxd's background work on a schedule: backup copies,
// the Trash purge, cleanup and the status light.
package jobs

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"
)

// ErrUnknownJob means RunNow was given a name that is not a job.
var ErrUnknownJob = errors.New("unknown job")

type timing struct {
	first time.Duration // after start
	every time.Duration
}

// schedule is when each job runs (a variable so tests can shorten it).
var schedule = map[string]timing{
	"replicate": {time.Minute, time.Hour},
	"purge":     {time.Minute, 24 * time.Hour},
	"cleanup":   {time.Minute, time.Hour},
	"light":     {time.Minute, time.Minute},
}

// Runner holds the jobs. Each returns a JSON-friendly result.
type Runner struct {
	Replicate func(context.Context) (any, error)
	Purge     func(context.Context) (any, error)
	Cleanup   func(context.Context) (any, error)
	Light     func(context.Context) (any, error)
	Logger    *slog.Logger

	mu    sync.Mutex
	locks map[string]*sync.Mutex // one run of each job at a time
}

func (r *Runner) job(name string) func(context.Context) (any, error) {
	switch name {
	case "replicate":
		return r.Replicate
	case "purge":
		return r.Purge
	case "cleanup":
		return r.Cleanup
	case "light":
		return r.Light
	}
	return nil
}

func (r *Runner) lock(name string) *sync.Mutex {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.locks == nil {
		r.locks = map[string]*sync.Mutex{}
	}
	if r.locks[name] == nil {
		r.locks[name] = &sync.Mutex{}
	}
	return r.locks[name]
}

// RunNow runs one job by name and returns its result. A job never runs
// twice at the same time; a second call waits for the first.
func (r *Runner) RunNow(ctx context.Context, name string) (any, error) {
	fn := r.job(name)
	if fn == nil {
		return nil, ErrUnknownJob
	}
	l := r.lock(name)
	l.Lock()
	defer l.Unlock()
	return fn(ctx)
}

// Run runs every job on its schedule until ctx is cancelled. Errors are
// logged (job name and error only) and the job runs again next time.
func (r *Runner) Run(ctx context.Context) {
	var wg sync.WaitGroup
	for name, t := range schedule {
		wg.Go(func() { r.loop(ctx, name, t) })
	}
	wg.Wait()
}

func (r *Runner) loop(ctx context.Context, name string, t timing) {
	timer := time.NewTimer(t.first)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		start := time.Now()
		if _, err := r.RunNow(ctx, name); err != nil && ctx.Err() == nil {
			r.logger().Warn("job failed", "job", name, "err", err)
		} else if err == nil && name != "light" {
			r.logger().Info("job done", "job", name, "duration_ms", time.Since(start).Milliseconds())
		}
		timer.Reset(t.every)
	}
}

func (r *Runner) logger() *slog.Logger {
	if r.Logger == nil {
		return slog.New(slog.DiscardHandler)
	}
	return r.Logger
}
