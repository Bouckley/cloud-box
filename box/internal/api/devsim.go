//go:build sim

package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/jobs"
)

// registerDevSim adds the simulator's dev API (S5: compiled only with the
// sim build tag, never in a Pi build). It has no auth: it is for local
// development on a laptop, and it is not part of api/openapi.yaml.
func registerDevSim(mux *http.ServeMux, h *handlers) {
	if h.d.Sim == nil || h.d.Jobs == nil {
		return
	}
	mux.HandleFunc("GET /dev/sim/state", h.simState)
	mux.HandleFunc("POST /dev/sim/button", h.simButton)
	mux.HandleFunc("POST /dev/sim/drives/{role}", h.simDrive)
	mux.HandleFunc("POST /dev/sim/clock/advance", h.simAdvance)
	mux.HandleFunc("POST /dev/sim/jobs/{name}", h.simJob)
}

func (h *handlers) simState(w http.ResponseWriter, r *http.Request) {
	list, err := h.d.Sim.HAL().Drives.List(r.Context())
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	type drive struct {
		Role      string `json:"role"`
		SizeBytes uint64 `json:"sizeBytes"`
		FreeBytes uint64 `json:"freeBytes"`
	}
	drives := make([]drive, len(list))
	for i, d := range list {
		drives[i] = drive{Role: d.Role, SizeBytes: d.SizeBytes, FreeBytes: d.FreeBytes}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"light":              h.d.Sim.Light().String(),
		"clockOffsetSeconds": int64(h.d.Sim.ClockOffset() / time.Second),
		"drives":             drives,
	})
}

func (h *handlers) simButton(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Kind string `json:"kind"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	switch req.Kind {
	case "short":
		h.d.Sim.Press(hal.ShortPress)
	case "long":
		h.d.Sim.Press(hal.LongPress)
	default:
		badRequest(w, "kind must be short or long")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"pressed": req.Kind})
}

func (h *handlers) simDrive(w http.ResponseWriter, r *http.Request) {
	role := r.PathValue("role")
	var req struct {
		Present     *bool `json:"present"`
		FillPercent *int  `json:"fillPercent"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	switch {
	case role != hal.RoleMain && role != hal.RoleBackup:
		badRequest(w, "role must be main or backup")
		return
	case req.Present == nil && req.FillPercent == nil:
		badRequest(w, "send present, fillPercent or both")
		return
	case req.Present != nil && role != hal.RoleBackup:
		badRequest(w, "only the backup drive can be unplugged")
		return
	}
	if req.FillPercent != nil {
		if err := h.d.Sim.SetFill(role, *req.FillPercent); err != nil {
			badRequest(w, "fillPercent must be 0 to 100")
			return
		}
	}
	if req.Present != nil {
		h.d.Sim.SetBackupPresent(*req.Present)
	}
	h.simState(w, r)
}

func (h *handlers) simAdvance(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Seconds int64 `json:"seconds"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.Seconds < 1 || req.Seconds > 10*365*24*3600 {
		badRequest(w, "seconds must be 1 to 10 years")
		return
	}
	h.d.Sim.Advance(time.Duration(req.Seconds) * time.Second)
	h.simState(w, r)
}

func (h *handlers) simJob(w http.ResponseWriter, r *http.Request) {
	res, err := h.d.Jobs.RunNow(r.Context(), r.PathValue("name"))
	if errors.Is(err, jobs.ErrUnknownJob) {
		notFound(w, r)
		return
	}
	if err != nil {
		// Dev only: show the job's error so the developer can see it.
		writeError(w, http.StatusConflict, apiError{Code: "job_failed", Message: err.Error(), Action: "See the boxd log."})
		return
	}
	if res == nil {
		res = map[string]any{}
	}
	writeJSON(w, http.StatusOK, res)
}
