//go:build !sim

package api

import (
	"net/http"
	"testing"
)

// S5: without the sim build tag the simulator's dev API does not exist.
func TestDevSimAbsentWithoutTag(t *testing.T) {
	e := newEnv(t)
	for _, r := range []struct{ method, path string }{
		{http.MethodGet, "/dev/sim/state"},
		{http.MethodPost, "/dev/sim/jobs/replicate"},
	} {
		if rec := e.call(r.method, r.path, "", nil); rec.Code != http.StatusNotFound {
			t.Errorf("%s %s = %d, want 404", r.method, r.path, rec.Code)
		}
	}
}
