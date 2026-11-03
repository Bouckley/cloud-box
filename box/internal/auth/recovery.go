package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// maxPendingRecoveryChallenges caps outstanding recovery challenges; the
// oldest is dropped first. Recovery is rare, so the cap is small.
const maxPendingRecoveryChallenges = 64

type pendingRecovery struct {
	publicKey []byte
	expires   time.Time
}

// RecoveryChallenge issues a single-use challenge (valid ChallengeTTL) for the
// user whose recovery public key this is. An unknown key is ErrUnauthorized.
func (s *Service) RecoveryChallenge(ctx context.Context, recoveryPublicKey []byte) (string, time.Time, error) {
	if _, err := userByRecoveryKey(ctx, s.db.DB(), recoveryPublicKey); err != nil {
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
	if s.recoveries == nil {
		s.recoveries = map[string]pendingRecovery{}
	}
	s.recoveries[ch] = pendingRecovery{publicKey: bytes.Clone(recoveryPublicKey), expires: expires}
	s.recoveryOrder = append(s.recoveryOrder, ch)
	for len(s.recoveries) > maxPendingRecoveryChallenges && len(s.recoveryOrder) > 0 {
		delete(s.recoveries, s.recoveryOrder[0])
		s.recoveryOrder = s.recoveryOrder[1:]
	}
	if len(s.recoveryOrder) > 4*maxPendingRecoveryChallenges {
		kept := s.recoveryOrder[:0]
		for _, c := range s.recoveryOrder {
			if _, ok := s.recoveries[c]; ok {
				kept = append(kept, c)
			}
		}
		s.recoveryOrder = kept
	}
	return ch, expires, nil
}

// RecoveryReset checks the recovery key's signature over
// boxcrypto.RecoverMessage(d.ID, challenge), then in one transaction revokes
// every device of that user, deletes their sessions and pairing codes, and
// adds d. The challenge is used up by any attempt. Every failure of key,
// challenge or signature is ErrUnauthorized; a reused device id is
// store.ErrIDTaken and changes nothing.
func (s *Service) RecoveryReset(ctx context.Context, recoveryPublicKey []byte, challenge string, sig []byte, d NewDevice) error {
	now := s.clock.Now()
	s.mu.Lock()
	pr, ok := s.recoveries[challenge]
	delete(s.recoveries, challenge)
	s.mu.Unlock()
	if !ok || !bytes.Equal(pr.publicKey, recoveryPublicKey) || now.After(pr.expires) {
		return ErrUnauthorized
	}
	if !boxcrypto.VerifyEd25519(recoveryPublicKey, boxcrypto.RecoverMessage(d.ID, challenge), sig) {
		return ErrUnauthorized
	}
	ms := now.UnixMilli()
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		userID, err := userByRecoveryKey(ctx, tx, recoveryPublicKey)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx,
			"UPDATE devices SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", ms, userID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ?", userID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM pairing_codes WHERE user_id = ?", userID); err != nil {
			return err
		}
		return insertDevice(ctx, tx, userID, d, ms)
	})
	if store.IsUniqueViolation(err) {
		return store.ErrIDTaken
	}
	return err
}

// userByRecoveryKey finds the user whose recovery public key this is.
func userByRecoveryKey(ctx context.Context, q querier, recoveryPublicKey []byte) (string, error) {
	if len(recoveryPublicKey) == 0 {
		return "", ErrUnauthorized
	}
	var userID string
	err := q.QueryRowContext(ctx, "SELECT id FROM users WHERE recovery_public_key = ?",
		recoveryPublicKey).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrUnauthorized
	}
	return userID, err
}
