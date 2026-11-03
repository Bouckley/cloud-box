package auth

import (
	"context"
	"database/sql"
)

// Cleanup deletes expired sessions, sessions of revoked devices (Revoke
// already deletes them; this catches any left by a crash) and pairing codes
// that are expired or used. It returns how many rows it removed.
func (s *Service) Cleanup(ctx context.Context) (int, error) {
	now := s.clock.Now().UnixMilli()
	total := 0
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		for _, q := range []struct {
			sql  string
			args []any
		}{
			{`DELETE FROM sessions WHERE expires_at <= ?
				OR device_id IN (SELECT id FROM devices WHERE revoked_at IS NOT NULL)`, []any{now}},
			{"DELETE FROM pairing_codes WHERE expires_at <= ? OR used_at IS NOT NULL", []any{now}},
		} {
			res, err := tx.ExecContext(ctx, q.sql, q.args...)
			if err != nil {
				return err
			}
			n, err := res.RowsAffected()
			if err != nil {
				return err
			}
			total += int(n)
		}
		return nil
	})
	return total, err
}
