package api

import "net/http"

type boxInfo struct {
	SetUp     bool   `json:"setUp"`
	SetupOpen bool   `json:"setupOpen"`
	Version   string `json:"version"`
}

// getInfo is public: a new browser asks it whether to show setup or connect.
// It reveals nothing beyond those two facts and the version.
func (h *handlers) getInfo(w http.ResponseWriter, r *http.Request) {
	setUp, err := h.d.Auth.IsSetUp(r.Context())
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, boxInfo{
		SetUp:     setUp,
		SetupOpen: !setUp && h.d.Auth.SetupOpen(h.d.Auth.Now()),
		Version:   h.d.Version,
	})
}
