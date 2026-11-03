package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

// ErrInvalid wraps input the service refuses (400 invalid_request). The
// message after the prefix is safe to show.
var ErrInvalid = errors.New("invalid")

// KDF limits clients accept (ADR 0002); the box refuses anything outside them.
const (
	MinOpsLimit = 2
	MaxOpsLimit = 10
	MinMemLimit = 64 << 20
	MaxMemLimit = 1 << 30

	saltBytes       = 16
	wrappedKeyBytes = 72 // nonce 24 + key 32 + tag 16
)

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{ErrInvalid}, a...)...)
}

// ValidateKDF checks Argon2id parameters against the limits every client
// accepts.
func ValidateKDF(k KDF) error {
	if k.OpsLimit < MinOpsLimit || k.OpsLimit > MaxOpsLimit {
		return invalid("kdf.opsLimit must be 2 to 10")
	}
	if k.MemLimitBytes < MinMemLimit || k.MemLimitBytes > MaxMemLimit {
		return invalid("kdf.memLimitBytes must be 64 MiB to 1 GiB")
	}
	if len(k.Salt) != saltBytes {
		return invalid("kdf.salt must be 16 bytes")
	}
	return nil
}

// ChangePassword replaces the user's password wrap of the master key and its
// KDF parameters. The box cannot check the old password (zero knowledge), so
// any signed-in device may do this; the recovery wrap is unchanged (ADR 0005).
func (s *Service) ChangePassword(ctx context.Context, userID string, kdf KDF, masterKeyByPassword []byte) error {
	if err := ValidateKDF(kdf); err != nil {
		return err
	}
	if len(masterKeyByPassword) != wrappedKeyBytes {
		return invalid("masterKeyByPassword must be 72 bytes")
	}
	res, err := s.db.DB().ExecContext(ctx, `UPDATE users SET kdf_salt = ?, kdf_ops = ?, kdf_mem = ?,
		master_key_password = ? WHERE id = ?`, kdf.Salt, kdf.OpsLimit, kdf.MemLimitBytes,
		masterKeyByPassword, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return store.ErrNotFound
	}
	return nil
}

// RenameDevice sets the encrypted name of one of the user's devices. Another
// user's or an unknown device is store.ErrNotFound.
func (s *Service) RenameDevice(ctx context.Context, userID, deviceID string, nameEnc []byte) (Device, error) {
	var d Device
	var created, lastSeen int64
	var revoked sql.NullInt64
	err := s.db.DB().QueryRowContext(ctx, `UPDATE devices SET name_enc = ? WHERE id = ? AND user_id = ?
		RETURNING id, name_enc, sign_public_key, created_at, last_seen, revoked_at`,
		nameEnc, deviceID, userID).Scan(&d.ID, &d.NameEnc, &d.SignPublicKey, &created, &lastSeen, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return Device{}, store.ErrNotFound
	}
	if err != nil {
		return Device{}, err
	}
	fillDevice(&d, created, lastSeen, revoked)
	return d, nil
}

// fillDevice converts stored times and the empty-name marker.
func fillDevice(d *Device, created, lastSeen int64, revoked sql.NullInt64) {
	if len(d.NameEnc) == 0 {
		d.NameEnc = nil // not named yet: JSON null
	}
	d.CreatedAt = time.UnixMilli(created).UTC()
	d.LastSeen = time.UnixMilli(lastSeen).UTC()
	if revoked.Valid {
		t := time.UnixMilli(revoked.Int64).UTC()
		d.RevokedAt = &t
	}
}
