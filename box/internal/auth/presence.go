package auth

import (
	"context"
	"errors"
	"time"
)

// SetupWindow is how long setup stays open after a short press of the power
// button (ADR 0005). It stops anyone on the network claiming a new box.
const SetupWindow = 10 * time.Minute

// ErrPressButton means setup is not open: the owner must press the box's
// power button first (409 press_button).
var ErrPressButton = errors.New("press the power button to open setup")

// OpenSetupWindow opens setup for SetupWindow from at. Each short press of
// the power button calls it; a later press extends the window.
func (s *Service) OpenSetupWindow(at time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if until := at.Add(SetupWindow); until.After(s.setupUntil) {
		s.setupUntil = until
	}
}

// SetupOpen reports whether the setup window is open at now. It says nothing
// about whether the box already has a user.
func (s *Service) SetupOpen(now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return now.Before(s.setupUntil)
}

// closeSetupWindow ends the window once setup has succeeded.
func (s *Service) closeSetupWindow() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.setupUntil = time.Time{}
}

// IsSetUp reports whether the box has a user.
func (s *Service) IsSetUp(ctx context.Context) (bool, error) {
	var n int
	err := s.db.DB().QueryRowContext(ctx, "SELECT count(*) FROM users").Scan(&n)
	return n > 0, err
}

// Now is the box's current time (the HAL clock), so handlers judge the setup
// window by the same clock as Setup.
func (s *Service) Now() time.Time { return s.clock.Now() }
