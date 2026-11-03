package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

// PairingTTL is how long a pairing code works (ADR 0004).
const PairingTTL = 10 * time.Minute

var (
	// ErrBadPairingCode is a used, expired or unknown pairing code. It is the
	// same error as a failed login (401), so codes cannot be probed.
	ErrBadPairingCode = ErrUnauthorized
	// ErrLastDevice means revoking would leave the user with no active device.
	ErrLastDevice = errors.New("cannot revoke the last active device")
)

// Device is a paired device as the API returns it.
type Device struct {
	ID            string     `json:"id"`
	NameEnc       []byte     `json:"nameEnc"`
	SignPublicKey []byte     `json:"signPublicKey"`
	CreatedAt     time.Time  `json:"createdAt"`
	LastSeen      time.Time  `json:"lastSeen"`
	RevokedAt     *time.Time `json:"revokedAt"`
}

// CreatePairingCode makes a single-use code for adding a device to the
// session's user. Only its SHA-256 is stored.
func (s *Service) CreatePairingCode(ctx context.Context, sess Session) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	code := base64.RawURLEncoding.EncodeToString(raw)
	expires := s.clock.Now().Add(PairingTTL)
	_, err := s.db.DB().ExecContext(ctx, `INSERT INTO pairing_codes (code_hash, user_id, created_by, expires_at)
		VALUES (?, ?, ?, ?)`, tokenHash(code), sess.UserID, sess.DeviceID, expires.UnixMilli())
	if err != nil {
		return "", time.Time{}, err
	}
	return code, expires, nil
}

// Pair adds d to the user who created code. The code must be unused,
// unexpired and from a device that is still active. A failed insert (for
// example a reused device id) leaves the code unused.
func (s *Service) Pair(ctx context.Context, code string, d NewDevice) (string, error) {
	now := s.clock.Now().UnixMilli()
	var userID string
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		// One conditional UPDATE claims the code, so it is single-use even
		// without relying on the store's single connection.
		err := tx.QueryRowContext(ctx, `UPDATE pairing_codes SET used_at = ?
			WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
			AND created_by IN (SELECT id FROM devices WHERE revoked_at IS NULL)
			RETURNING user_id`, now, tokenHash(code), now).Scan(&userID)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrBadPairingCode
		}
		if err != nil {
			return err
		}
		return insertDevice(ctx, tx, userID, d, now)
	})
	if store.IsUniqueViolation(err) {
		return "", store.ErrIDTaken
	}
	if err != nil {
		return "", err
	}
	return userID, nil
}

// Devices lists the user's devices, oldest first, including revoked ones.
func (s *Service) Devices(ctx context.Context, userID string) ([]Device, error) {
	rows, err := s.db.DB().QueryContext(ctx, `SELECT id, name_enc, sign_public_key, created_at,
		last_seen, revoked_at FROM devices WHERE user_id = ? ORDER BY created_at, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	devices := []Device{}
	for rows.Next() {
		var d Device
		var created, lastSeen int64
		var revoked sql.NullInt64
		if err := rows.Scan(&d.ID, &d.NameEnc, &d.SignPublicKey, &created, &lastSeen, &revoked); err != nil {
			return nil, err
		}
		d.CreatedAt = time.UnixMilli(created).UTC()
		d.LastSeen = time.UnixMilli(lastSeen).UTC()
		if revoked.Valid {
			t := time.UnixMilli(revoked.Int64).UTC()
			d.RevokedAt = &t
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// Revoke revokes one of the user's devices: its sessions and unused pairing
// codes are deleted at once. Revoking an already revoked device is a no-op.
// Another user's or an unknown device is store.ErrNotFound.
func (s *Service) Revoke(ctx context.Context, userID, deviceID string) error {
	now := s.clock.Now().UnixMilli()
	return s.db.Tx(ctx, func(tx *sql.Tx) error {
		var revoked sql.NullInt64
		err := tx.QueryRowContext(ctx, "SELECT revoked_at FROM devices WHERE id = ? AND user_id = ?",
			deviceID, userID).Scan(&revoked)
		if errors.Is(err, sql.ErrNoRows) {
			return store.ErrNotFound
		}
		if err != nil || revoked.Valid {
			return err
		}
		var active int
		if err := tx.QueryRowContext(ctx,
			"SELECT count(*) FROM devices WHERE user_id = ? AND revoked_at IS NULL", userID).Scan(&active); err != nil {
			return err
		}
		if active <= 1 {
			return ErrLastDevice
		}
		if _, err := tx.ExecContext(ctx, "UPDATE devices SET revoked_at = ? WHERE id = ?", now, deviceID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE device_id = ?", deviceID); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx,
			"DELETE FROM pairing_codes WHERE created_by = ? AND used_at IS NULL", deviceID)
		return err
	})
}
