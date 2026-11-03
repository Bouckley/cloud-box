package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
)

// Login timings and limits (ADR 0004).
const (
	ChallengeTTL         = 60 * time.Second
	SessionTTL           = time.Hour
	maxPendingChallenges = 1024
)

// ErrUnauthorized is the one error for every login or session failure, so
// the box never reveals which devices exist or why a login failed.
var ErrUnauthorized = errors.New("unauthorized")

// Session identifies the signed-in user and device.
type Session struct {
	UserID, DeviceID string
}

type pendingChallenge struct {
	deviceID string
	expires  time.Time
}

// Challenge issues a single-use challenge for an active device.
func (s *Service) Challenge(ctx context.Context, deviceID string) (string, time.Time, error) {
	if _, _, err := s.activeDevice(ctx, deviceID); err != nil {
		return "", time.Time{}, err
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", time.Time{}, err
	}
	ch := hex.EncodeToString(b)
	expires := s.clock.Now().Add(ChallengeTTL)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.challenges[ch] = pendingChallenge{deviceID: deviceID, expires: expires}
	s.challengeOrder = append(s.challengeOrder, ch)
	// Evict the oldest until under the cap. Entries already used are gone
	// from the map; drop them from the order list as we pass.
	for len(s.challenges) > maxPendingChallenges && len(s.challengeOrder) > 0 {
		delete(s.challenges, s.challengeOrder[0])
		s.challengeOrder = s.challengeOrder[1:]
	}
	if len(s.challengeOrder) > 4*maxPendingChallenges {
		s.compactChallengeOrder()
	}
	return ch, expires, nil
}

// compactChallengeOrder drops used challenges from the order list; the
// caller holds s.mu.
func (s *Service) compactChallengeOrder() {
	kept := s.challengeOrder[:0]
	for _, ch := range s.challengeOrder {
		if _, ok := s.challenges[ch]; ok {
			kept = append(kept, ch)
		}
	}
	s.challengeOrder = kept
}

// Verify checks the device's signature over AuthMessage(deviceID, challenge)
// and starts a session. The challenge is used up whatever the outcome.
func (s *Service) Verify(ctx context.Context, deviceID, challenge string, sig []byte) (string, time.Time, error) {
	now := s.clock.Now()
	s.mu.Lock()
	pc, ok := s.challenges[challenge]
	delete(s.challenges, challenge)
	s.mu.Unlock()
	if !ok || pc.deviceID != deviceID || now.After(pc.expires) {
		return "", time.Time{}, ErrUnauthorized
	}

	userID, pub, err := s.activeDevice(ctx, deviceID)
	if err != nil {
		return "", time.Time{}, err
	}
	if !boxcrypto.VerifyEd25519(pub, boxcrypto.AuthMessage(deviceID, challenge), sig) {
		return "", time.Time{}, ErrUnauthorized
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	expires := now.Add(SessionTTL)
	err = s.db.Tx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO sessions (token_hash, user_id, device_id, expires_at) VALUES (?, ?, ?, ?)",
			tokenHash(token), userID, deviceID, expires.UnixMilli()); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, "UPDATE devices SET last_seen = ? WHERE id = ?", now.UnixMilli(), deviceID)
		return err
	})
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expires, nil
}

// Authenticate returns the session for a bearer token. Expired tokens and
// tokens of revoked devices are ErrUnauthorized. Lookup is by SHA-256 of
// the token, so response timing reveals nothing about stored tokens.
func (s *Service) Authenticate(ctx context.Context, token string) (Session, error) {
	var sess Session
	err := s.db.DB().QueryRowContext(ctx, `SELECT s.user_id, s.device_id FROM sessions s
		JOIN devices d ON d.id = s.device_id
		WHERE s.token_hash = ? AND s.expires_at > ? AND d.revoked_at IS NULL`,
		tokenHash(token), s.clock.Now().UnixMilli()).Scan(&sess.UserID, &sess.DeviceID)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrUnauthorized
	}
	return sess, err
}

// activeDevice returns an unrevoked device's user and public key.
func (s *Service) activeDevice(ctx context.Context, deviceID string) (string, []byte, error) {
	var userID string
	var pub []byte
	err := s.db.DB().QueryRowContext(ctx,
		"SELECT user_id, sign_public_key FROM devices WHERE id = ? AND revoked_at IS NULL",
		deviceID).Scan(&userID, &pub)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil, ErrUnauthorized
	}
	return userID, pub, err
}

func tokenHash(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// pendingChallenges is the number of outstanding challenges (tests).
func (s *Service) pendingChallenges() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.challenges)
}
