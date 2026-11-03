package api

import (
	"net/http"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
)

func (h *handlers) getStatus(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	s, err := h.d.Status.Summary(r.Context(), sess.UserID)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	type device struct {
		ID           string     `json:"id"`
		NameEnc      []byte     `json:"nameEnc"`
		LastBackupAt *time.Time `json:"lastBackupAt"`
	}
	type drive struct {
		Role      string `json:"role"`
		SizeBytes uint64 `json:"sizeBytes"`
		FreeBytes uint64 `json:"freeBytes"`
	}
	devices := make([]device, len(s.Devices))
	for i, d := range s.Devices {
		devices[i] = device{ID: d.ID, NameEnc: d.NameEnc, LastBackupAt: d.LastBackupAt}
	}
	drives := make([]drive, len(s.Drives))
	for i, d := range s.Drives {
		drives[i] = drive{Role: d.Role, SizeBytes: d.SizeBytes, FreeBytes: d.FreeBytes}
	}
	warnings := make([]apiError, len(s.Warnings))
	for i, wn := range s.Warnings {
		warnings[i] = apiError{Code: wn.Code, Message: wn.Message, Action: wn.Action}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"safe": s.Safe,
		"items": map[string]int{
			"total": s.Items.Total, "verified": s.Items.Verified, "replicated": s.Items.Replicated,
			"notYetCopied": s.Items.NotYetCopied, "trashed": s.Items.Trashed,
		},
		"devices": devices, "drives": drives, "lastCopyAt": s.LastCopyAt, "warnings": warnings,
	})
}
