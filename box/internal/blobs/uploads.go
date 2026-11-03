package blobs

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

var errAlreadyCompleted = errors.New("upload already completed")

// Upload is a resumable upload in progress.
type Upload struct {
	ID        string
	SHA256    string
	Size      int64
	PartCount int
	Received  []int
	ExpiresAt time.Time
	blobID    string
	userID    string
}

// CreateUpload starts an upload of size bytes whose ciphertext has the given
// SHA-256 (hex). Inputs must already be validated. It refuses with
// ErrStorageFull when the main drive cannot hold this blob, the bytes still
// owed to other unfinished uploads, and ReserveBytes. Nothing is written to
// disk until the first part arrives.
func (s *Service) CreateUpload(ctx context.Context, sess auth.Session, size int64, sha256Hex string) (Upload, error) {
	_, drive, err := s.mainRoot(ctx)
	if err != nil {
		return Upload{}, err
	}
	now := s.hal.Clock.Now()
	var owed int64
	if err := s.db.DB().QueryRowContext(ctx, `SELECT COALESCE(SUM(u.size -
		COALESCE((SELECT SUM(p.size) FROM upload_parts p WHERE p.upload_id = u.id), 0)), 0)
		FROM uploads u WHERE u.blob_id IS NULL AND u.expires_at > ?`, now.UnixMilli()).Scan(&owed); err != nil {
		return Upload{}, err
	}
	if size < 0 || uint64(size)+uint64(max(owed, 0))+ReserveBytes > drive.FreeBytes {
		return Upload{}, ErrStorageFull
	}
	id, err := newBoxID()
	if err != nil {
		return Upload{}, err
	}
	up := Upload{
		ID: id, SHA256: sha256Hex, Size: size,
		PartCount: int((size + PartBytes - 1) / PartBytes),
		Received:  []int{},
		ExpiresAt: now.Add(UploadTTL).UTC(),
	}
	_, err = s.db.DB().ExecContext(ctx, `INSERT INTO uploads (id, user_id, device_id, size, sha256,
		part_count, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, sess.UserID, sess.DeviceID, size, sha256Hex, up.PartCount, now.UnixMilli(), up.ExpiresAt.UnixMilli())
	if err != nil {
		return Upload{}, err
	}
	return up, nil
}

// dataPath is the single file an upload's parts are written into.
func dataPath(root, uploadID string) string {
	return filepath.Join(root, "uploads", uploadID)
}

// load returns the user's unexpired upload, or store.ErrNotFound.
func (s *Service) load(ctx context.Context, userID, uploadID string) (Upload, error) {
	up := Upload{ID: uploadID, userID: userID}
	var expires int64
	var blobID sql.NullString
	err := s.db.DB().QueryRowContext(ctx, `SELECT sha256, size, part_count, expires_at, blob_id
		FROM uploads WHERE id = ? AND user_id = ?`, uploadID, userID).
		Scan(&up.SHA256, &up.Size, &up.PartCount, &expires, &blobID)
	if errors.Is(err, sql.ErrNoRows) {
		return Upload{}, store.ErrNotFound
	}
	if err != nil {
		return Upload{}, err
	}
	up.blobID = blobID.String
	millis(&up.ExpiresAt, expires)
	if !blobID.Valid && s.hal.Clock.Now().After(up.ExpiresAt) {
		return Upload{}, store.ErrNotFound
	}
	return up, nil
}

// partSize is the exact size part n must have.
func (u Upload) partSize(n int) int64 {
	if n == u.PartCount-1 {
		return u.Size - int64(n)*PartBytes
	}
	return PartBytes
}

// bodyReader remembers whether an error came from the request body (the
// client's fault) rather than from writing the file (the box's fault).
type bodyReader struct {
	r   io.Reader
	err error
}

func (b *bodyReader) Read(p []byte) (int, error) {
	n, err := b.r.Read(p)
	if err != nil && err != io.EOF {
		b.err = err
	}
	return n, err
}

// PutPart writes part n into the upload's data file at byte n × PartBytes.
// Re-sending a part replaces it. A part of the wrong size is ErrBadPart and is
// not counted as received. On a completed upload it is a no-op.
func (s *Service) PutPart(ctx context.Context, userID, uploadID string, n int, body io.Reader) error {
	l := s.lock(uploadID)
	l.RLock()
	defer l.RUnlock()

	up, err := s.load(ctx, userID, uploadID)
	if err != nil {
		return err
	}
	if up.blobID != "" {
		return nil
	}
	if n < 0 || n >= up.PartCount {
		return ErrBadPart
	}
	root, _, err := s.mainRoot(ctx)
	if err != nil {
		return err
	}
	// The part's bytes are about to change: it is not received until they
	// are written and synced again.
	if _, err := s.db.DB().ExecContext(ctx,
		"DELETE FROM upload_parts WHERE upload_id = ? AND n = ?", uploadID, n); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(root, "uploads"), 0o700); err != nil {
		return diskErr(err)
	}
	f, err := os.OpenFile(dataPath(root, uploadID), os.O_WRONLY|os.O_CREATE, 0o600)
	if err != nil {
		return diskErr(err)
	}
	want := up.partSize(n)
	br := &bodyReader{r: body}
	// Write exactly the part's own byte range, never a byte past it: a part
	// that turns out too long must not touch the next part or the file size.
	written, err := io.Copy(io.NewOffsetWriter(f, int64(n)*PartBytes), io.LimitReader(br, want))
	if br.err != nil {
		f.Close()
		return fmt.Errorf("%w: %v", ErrBadPart, br.err)
	}
	if err != nil {
		f.Close()
		return diskErr(err)
	}
	if written != want {
		f.Close()
		return ErrBadPart // too short
	}
	var extra [1]byte
	if k, _ := io.ReadFull(br, extra[:]); k > 0 || br.err != nil {
		f.Close()
		return ErrBadPart // too long (or the body failed at the end)
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return diskErr(err)
	}
	if err := f.Close(); err != nil {
		return diskErr(err)
	}
	if err := syncDir(filepath.Join(root, "uploads")); err != nil {
		return err
	}
	// Record the part and keep the upload alive: it expires UploadTTL after
	// the last part arrived, not after it was created.
	return s.db.Tx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO upload_parts (upload_id, n, size) VALUES (?, ?, ?)
			ON CONFLICT (upload_id, n) DO UPDATE SET size = excluded.size`, uploadID, n, want); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, "UPDATE uploads SET expires_at = ? WHERE id = ?",
			s.hal.Clock.Now().Add(UploadTTL).UnixMilli(), uploadID)
		return err
	})
}

// GetUpload returns the upload with the parts received so far, ascending.
func (s *Service) GetUpload(ctx context.Context, userID, uploadID string) (Upload, error) {
	up, err := s.load(ctx, userID, uploadID)
	if err != nil {
		return Upload{}, err
	}
	up.Received, err = s.received(ctx, uploadID)
	return up, err
}

func (s *Service) received(ctx context.Context, uploadID string) ([]int, error) {
	rows, err := s.db.DB().QueryContext(ctx, "SELECT n FROM upload_parts WHERE upload_id = ? ORDER BY n", uploadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	parts := []int{}
	for rows.Next() {
		var n int
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		parts = append(parts, n)
	}
	return parts, rows.Err()
}

// Complete checks the data file's SHA-256 and stores it as a blob, then
// re-reads it from the drive to mark it verified. It is safe to retry: a
// completed upload returns its blob with created=false. On a hash mismatch the
// parts are discarded and must be sent again. It finishes even if ctx is
// cancelled (the client went away), so no half-recorded blob is left behind.
func (s *Service) Complete(ctx context.Context, userID, uploadID string) (Blob, bool, error) {
	ctx = context.WithoutCancel(ctx)
	l := s.lock(uploadID)
	l.Lock()
	defer l.Unlock()

	up, err := s.load(ctx, userID, uploadID)
	if err != nil {
		return Blob{}, false, err
	}
	if up.blobID != "" {
		b, err := s.blob(ctx, userID, up.blobID)
		return b, false, err
	}
	received, err := s.received(ctx, uploadID)
	if err != nil {
		return Blob{}, false, err
	}
	if len(received) != up.PartCount {
		return Blob{}, false, ErrUploadIncomplete
	}
	root, _, err := s.mainRoot(ctx)
	if err != nil {
		return Blob{}, false, err
	}
	src := dataPath(root, uploadID)

	// The parts were recorded but their data is gone or short (for example
	// a drive problem): forget them so the client sends them again.
	if fi, err := os.Stat(src); errors.Is(err, os.ErrNotExist) || (err == nil && fi.Size() != up.Size) {
		if err := s.resetParts(ctx, uploadID, src); err != nil {
			return Blob{}, false, err
		}
		return Blob{}, false, ErrUploadIncomplete
	} else if err != nil {
		return Blob{}, false, err
	}

	digest, err := hashFile(src)
	if err != nil {
		return Blob{}, false, err
	}
	if digest != up.SHA256 {
		if err := s.resetParts(ctx, uploadID, src); err != nil {
			return Blob{}, false, err
		}
		return Blob{}, false, ErrHashMismatch
	}

	blobID, err := newBoxID()
	if err != nil {
		return Blob{}, false, err
	}
	dest := BlobPath(root, blobID)
	if err := os.MkdirAll(filepath.Dir(dest), 0o700); err != nil {
		return Blob{}, false, diskErr(err)
	}
	if err := os.Rename(src, dest); err != nil {
		return Blob{}, false, diskErr(err)
	}
	if err := syncDir(filepath.Dir(dest)); err != nil {
		return Blob{}, false, err
	}

	now := s.hal.Clock.Now()
	b := Blob{ID: blobID, SHA256: digest, Size: up.Size}
	millis(&b.StoredAt, now.UnixMilli())
	var verifiedAt sql.NullInt64
	if got, err := HashFileUncached(dest); err == nil && got == digest {
		verifiedAt = sql.NullInt64{Int64: now.UnixMilli(), Valid: true}
		v := b.StoredAt
		b.VerifiedAt = &v
	}

	err = s.db.Tx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO blobs (id, owner_id, size, sha256, stored_at, verified_at)
			VALUES (?, ?, ?, ?, ?, ?)`, blobID, userID, up.Size, digest, now.UnixMilli(), verifiedAt); err != nil {
			return err
		}
		// Claim the upload only if nothing else got there first.
		// The row stays for UploadTTL more, so a retry after a lost response
		// still gets this blob.
		res, err := tx.ExecContext(ctx, "UPDATE uploads SET blob_id = ?, expires_at = ? WHERE id = ? AND blob_id IS NULL",
			blobID, now.Add(UploadTTL).UnixMilli(), uploadID)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil || n != 1 {
			return errAlreadyCompleted
		}
		_, err = tx.ExecContext(ctx, "DELETE FROM upload_parts WHERE upload_id = ?", uploadID)
		return err
	})
	if errors.Is(err, errAlreadyCompleted) {
		_ = os.Remove(dest)
		up, err := s.load(ctx, userID, uploadID)
		if err != nil {
			return Blob{}, false, err
		}
		b, err := s.blob(ctx, userID, up.blobID)
		return b, false, err
	}
	if err != nil {
		// Not recorded: put the data back so a retry can complete it.
		if os.Rename(dest, src) != nil {
			_ = os.Remove(dest)
		}
		return Blob{}, false, err
	}
	return b, true, nil
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	return hashReader(f)
}

// HashFileUncached returns the SHA-256 (hex) of the file as it is on the
// drive, not as it is in the page cache, so "verified" means the drive
// really holds these bytes.
func HashFileUncached(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	DropCache(f)
	return hashReader(f)
}

func hashReader(r io.Reader) (string, error) {
	h := sha256.New()
	if _, err := io.Copy(h, r); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// resetParts discards every received part so the client sends them again.
// The caller holds the upload's write lock.
func (s *Service) resetParts(ctx context.Context, uploadID, dataFile string) error {
	if _, err := s.db.DB().ExecContext(ctx, "DELETE FROM upload_parts WHERE upload_id = ?", uploadID); err != nil {
		return err
	}
	if err := os.Remove(dataFile); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// blob loads one of the user's blobs.
func (s *Service) blob(ctx context.Context, userID, blobID string) (Blob, error) {
	b := Blob{ID: blobID}
	var stored int64
	var verified sql.NullInt64
	err := s.db.DB().QueryRowContext(ctx, `SELECT sha256, size, stored_at, verified_at FROM blobs
		WHERE id = ? AND owner_id = ?`, blobID, userID).Scan(&b.SHA256, &b.Size, &stored, &verified)
	if errors.Is(err, sql.ErrNoRows) {
		return Blob{}, store.ErrNotFound
	}
	if err != nil {
		return Blob{}, err
	}
	millis(&b.StoredAt, stored)
	if verified.Valid {
		var v time.Time
		millis(&v, verified.Int64)
		b.VerifiedAt = &v
	}
	return b, nil
}
