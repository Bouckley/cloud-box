package auth

import (
	"context"
	"testing"
	"time"
)

func TestCleanup(t *testing.T) {
	s, db, sm := newService(t)
	ctx := context.Background()
	user, live, revoked := newID(), newID(), newID()
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.DB().Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustExec(`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password, master_key_recovery,
		identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
		VALUES (?, 'owner', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`, user)
	for _, d := range []string{live, revoked} {
		mustExec(`INSERT INTO devices (id, user_id, name_enc, sign_public_key, created_at, last_seen)
			VALUES (?, ?, x'00', x'00', 0, 0)`, d, user)
	}
	mustExec("UPDATE devices SET revoked_at = 1 WHERE id = ?", revoked)
	now := sm.HAL().Clock.Now()
	later, earlier := now.Add(time.Hour).UnixMilli(), now.Add(-time.Minute).UnixMilli()
	sessions := []struct {
		device  string
		expires int64
	}{{live, later}, {live, earlier}, {revoked, later}}
	for _, ss := range sessions {
		mustExec("INSERT INTO sessions (token_hash, user_id, device_id, expires_at) VALUES (?, ?, ?, ?)",
			randBytes(32), user, ss.device, ss.expires)
	}
	codes := []struct {
		expires int64
		used    any
	}{{later, nil}, {earlier, nil}, {later, now.UnixMilli()}}
	for _, c := range codes {
		mustExec("INSERT INTO pairing_codes (code_hash, user_id, created_by, expires_at, used_at) VALUES (?, ?, ?, ?, ?)",
			randBytes(32), user, live, c.expires, c.used)
	}

	n, err := s.Cleanup(ctx)
	if err != nil || n != 4 {
		t.Fatalf("Cleanup = %d, %v; want 4 (expired session, revoked device's session, expired code, used code)", n, err)
	}
	for table, want := range map[string]int{"sessions": 1, "pairing_codes": 1} {
		var got int
		_ = db.DB().QueryRow("SELECT COUNT(*) FROM " + table).Scan(&got)
		if got != want {
			t.Errorf("%s = %d, want %d", table, got, want)
		}
	}
	if n, _ := s.Cleanup(ctx); n != 0 {
		t.Errorf("second Cleanup = %d, want 0", n)
	}
}
