package auth

import (
	"context"
	"database/sql"
	"errors"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

// ErrAlreadySetUp means the box already has a user (409 already_set_up).
var ErrAlreadySetUp = errors.New("box is already set up")

// KDF is the Argon2id salt and limits stored next to the password-wrapped
// master key (ADR 0002).
type KDF struct {
	Salt          []byte `json:"salt"`
	OpsLimit      int    `json:"opsLimit"`
	MemLimitBytes int64  `json:"memLimitBytes"`
}

// NewUser is the owner's key material from setup. Every key is wrapped
// (ciphertext) except the identity public key.
type NewUser struct {
	ID                  string `json:"id"`
	KDF                 KDF    `json:"kdf"`
	MasterKeyByPassword []byte `json:"masterKeyByPassword"`
	MasterKeyByRecovery []byte `json:"masterKeyByRecovery"`
	IdentityPublicKey   []byte `json:"identityPublicKey"`
	IdentityKeyEnc      []byte `json:"identityKeyEnc"`
	DedupeKeyEnc        []byte `json:"dedupeKeyEnc"`
}

// Account is a user's role plus their wrapped key material.
type Account struct {
	Role string `json:"role"`
	NewUser
}

// NewDevice is a device to add: its id, encrypted name and Ed25519 public key.
type NewDevice struct {
	ID            string `json:"id"`
	NameEnc       []byte `json:"nameEnc"`
	SignPublicKey []byte `json:"signPublicKey"`
}

// Setup creates the owner and their first device. It works only while the
// box has no user. Inputs must already be validated by the caller.
func (s *Service) Setup(ctx context.Context, u NewUser, d NewDevice) (Account, error) {
	now := s.clock.Now().UnixMilli()
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		var n int
		if err := tx.QueryRowContext(ctx, "SELECT count(*) FROM users").Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return ErrAlreadySetUp
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem,
			master_key_password, master_key_recovery, identity_public_key, identity_key_enc,
			dedupe_key_enc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			u.ID, RoleOwner, u.KDF.Salt, u.KDF.OpsLimit, u.KDF.MemLimitBytes,
			u.MasterKeyByPassword, u.MasterKeyByRecovery, u.IdentityPublicKey,
			u.IdentityKeyEnc, u.DedupeKeyEnc, now); err != nil {
			return err
		}
		return insertDevice(ctx, tx, u.ID, d, now)
	})
	if store.IsUniqueViolation(err) {
		return Account{}, store.ErrIDTaken
	}
	if err != nil {
		return Account{}, err
	}
	return Account{Role: RoleOwner, NewUser: u}, nil
}

func insertDevice(ctx context.Context, tx *sql.Tx, userID string, d NewDevice, now int64) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO devices (id, user_id, name_enc, sign_public_key,
		created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)`,
		d.ID, userID, d.NameEnc, d.SignPublicKey, now, now)
	return err
}

// Account returns a user's role and wrapped key material.
func (s *Service) Account(ctx context.Context, userID string) (Account, error) {
	a := Account{NewUser: NewUser{ID: userID}}
	err := s.db.DB().QueryRowContext(ctx, `SELECT role, kdf_salt, kdf_ops, kdf_mem,
		master_key_password, master_key_recovery, identity_public_key, identity_key_enc,
		dedupe_key_enc FROM users WHERE id = ?`, userID).Scan(&a.Role, &a.KDF.Salt,
		&a.KDF.OpsLimit, &a.KDF.MemLimitBytes, &a.MasterKeyByPassword, &a.MasterKeyByRecovery,
		&a.IdentityPublicKey, &a.IdentityKeyEnc, &a.DedupeKeyEnc)
	if errors.Is(err, sql.ErrNoRows) {
		return Account{}, store.ErrNotFound
	}
	return a, err
}
