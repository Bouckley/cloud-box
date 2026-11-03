package jobs

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type counters struct {
	replicate, purge, cleanup, light atomic.Int32
}

func newRunner(c *counters, logs *syncBuffer) *Runner {
	count := func(n *atomic.Int32, err error) func(context.Context) (any, error) {
		return func(context.Context) (any, error) {
			n.Add(1)
			return map[string]int{"n": int(n.Load())}, err
		}
	}
	return &Runner{
		Replicate: count(&c.replicate, nil),
		Purge:     count(&c.purge, nil),
		Cleanup:   count(&c.cleanup, errors.New("disk on fire")),
		Light:     count(&c.light, nil),
		Logger:    slog.New(slog.NewTextHandler(logs, nil)),
	}
}

type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

func TestRunNow(t *testing.T) {
	var c counters
	r := newRunner(&c, &syncBuffer{})
	res, err := r.RunNow(context.Background(), "purge")
	if err != nil || c.purge.Load() != 1 || c.replicate.Load()+c.cleanup.Load()+c.light.Load() != 0 {
		t.Fatalf("RunNow(purge) = %v, %v; counts %d/%d/%d/%d", res, err,
			c.replicate.Load(), c.purge.Load(), c.cleanup.Load(), c.light.Load())
	}
	if res.(map[string]int)["n"] != 1 {
		t.Errorf("result = %v", res)
	}
	if _, err := r.RunNow(context.Background(), "defrag"); !errors.Is(err, ErrUnknownJob) {
		t.Errorf("unknown job: %v", err)
	}
}

func TestRunKeepsGoingAfterErrors(t *testing.T) {
	old := schedule
	t.Cleanup(func() { schedule = old })
	schedule = map[string]timing{
		"replicate": {first: 5 * time.Millisecond, every: 10 * time.Millisecond},
		"purge":     {first: 5 * time.Millisecond, every: time.Hour},
		"cleanup":   {first: 5 * time.Millisecond, every: 10 * time.Millisecond},
		"light":     {first: 5 * time.Millisecond, every: 10 * time.Millisecond},
	}
	var c counters
	logs := &syncBuffer{}
	r := newRunner(&c, logs)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { r.Run(ctx); close(done) }()
	time.Sleep(120 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not stop after cancel")
	}
	if c.cleanup.Load() < 3 {
		t.Errorf("failing cleanup ran %d times, want it to keep running", c.cleanup.Load())
	}
	if c.replicate.Load() < 3 || c.light.Load() < 3 || c.purge.Load() != 1 {
		t.Errorf("counts replicate %d light %d purge %d", c.replicate.Load(), c.light.Load(), c.purge.Load())
	}
	if out := logs.String(); !strings.Contains(out, "job=cleanup") || !strings.Contains(out, "disk on fire") {
		t.Errorf("job error not logged: %s", out)
	}
}

func TestDefaultSchedule(t *testing.T) {
	want := map[string]timing{
		"replicate": {time.Minute, time.Hour},
		"purge":     {time.Minute, 24 * time.Hour},
		"cleanup":   {time.Minute, time.Hour},
		"light":     {time.Minute, time.Minute},
	}
	for name, w := range want {
		if schedule[name] != w {
			t.Errorf("%s = %+v, want %+v", name, schedule[name], w)
		}
	}
}
