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
	"strconv"
	"sync"
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
// ErrStorageFull when the main drive cannot hold the blob plus ReserveBytes.
func (s *Service) CreateUpload(ctx context.Context, sess auth.Session, size int64, sha256Hex string) (Upload, error) {
	root, drive, err := s.mainRoot(ctx)
	if err != nil {
		return Upload{}, err
	}
	if size < 0 || uint64(size)+ReserveBytes > drive.FreeBytes {
		return Upload{}, ErrStorageFull
	}
	id, err := newBoxID()
	if err != nil {
		return Upload{}, err
	}
	now := s.hal.Clock.Now()
	up := Upload{
		ID: id, SHA256: sha256Hex, Size: size,
		PartCount: int((size + PartBytes - 1) / PartBytes),
		Received:  []int{},
		ExpiresAt: now.Add(UploadTTL).UTC(),
	}
	if err := os.MkdirAll(filepath.Join(root, "uploads", id), 0o700); err != nil {
		return Upload{}, err
	}
	_, err = s.db.DB().ExecContext(ctx, `INSERT INTO uploads (id, user_id, device_id, size, sha256,
		part_count, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, sess.UserID, sess.DeviceID, size, sha256Hex, up.PartCount, now.UnixMilli(), up.ExpiresAt.UnixMilli())
	if err != nil {
		return Upload{}, err
	}
	return up, nil
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

// PutPart stores part n. Re-sending a part replaces it. A part of the wrong
// size is ErrBadPart and is not kept. On a completed upload it is a no-op.
func (s *Service) PutPart(ctx context.Context, userID, uploadID string, n int, body io.Reader) error {
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
	dir := filepath.Join(root, "uploads", uploadID)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".part-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename

	want := up.partSize(n)
	br := &bodyReader{r: body}
	written, err := io.Copy(tmp, io.LimitReader(br, want+1))
	if br.err != nil {
		tmp.Close()
		return fmt.Errorf("%w: %v", ErrBadPart, br.err)
	}
	if err != nil {
		tmp.Close()
		return err
	}
	if written != want {
		tmp.Close()
		return ErrBadPart
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), filepath.Join(dir, strconv.Itoa(n))); err != nil {
		return err
	}
	if err := syncDir(dir); err != nil {
		return err
	}
	_, err = s.db.DB().ExecContext(ctx, `INSERT INTO upload_parts (upload_id, n, size) VALUES (?, ?, ?)
		ON CONFLICT (upload_id, n) DO UPDATE SET size = excluded.size`, uploadID, n, want)
	return err
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

// Complete assembles the parts, checks the SHA-256 and stores the blob, then
// re-reads it to mark it verified. It is safe to retry: a completed upload
// returns its blob with created=false. On a hash mismatch the parts are
// discarded and must be sent again.
func (s *Service) Complete(ctx context.Context, userID, uploadID string) (Blob, bool, error) {
	lock, _ := s.completing.LoadOrStore(uploadID, &sync.Mutex{})
	lock.(*sync.Mutex).Lock()
	defer func() {
		lock.(*sync.Mutex).Unlock()
		s.completing.Delete(uploadID)
	}()

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
	partsDir := filepath.Join(root, "uploads", uploadID)

	tmpPath, digest, err := assemble(root, partsDir, up.PartCount)
	if err != nil {
		return Blob{}, false, err
	}
	defer os.Remove(tmpPath) // no-op after a successful rename
	if digest != up.SHA256 {
		if err := s.resetParts(ctx, uploadID, partsDir); err != nil {
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
		return Blob{}, false, err
	}
	if err := os.Rename(tmpPath, dest); err != nil {
		return Blob{}, false, err
	}
	if err := syncDir(filepath.Dir(dest)); err != nil {
		return Blob{}, false, err
	}

	now := s.hal.Clock.Now()
	b := Blob{ID: blobID, SHA256: digest, Size: up.Size}
	millis(&b.StoredAt, now.UnixMilli())
	var verifiedAt sql.NullInt64
	if got, err := hashFile(dest); err == nil && got == digest {
		verifiedAt = sql.NullInt64{Int64: now.UnixMilli(), Valid: true}
		v := b.StoredAt
		b.VerifiedAt = &v
	}

	err = s.db.Tx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO blobs (id, owner_id, size, sha256, stored_at, verified_at)
			VALUES (?, ?, ?, ?, ?, ?)`, blobID, userID, up.Size, digest, now.UnixMilli(), verifiedAt); err != nil {
			return err
		}
		// Claim the upload only if no other Complete got there first.
		res, err := tx.ExecContext(ctx, "UPDATE uploads SET blob_id = ? WHERE id = ? AND blob_id IS NULL", blobID, uploadID)
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
		// The file is in place but unrecorded; M4's scrub reports orphans.
		return Blob{}, false, err
	}
	_ = os.RemoveAll(partsDir)
	return b, true, nil
}

// assemble concatenates the parts into a new file under <root>/tmp while
// hashing, fsyncs it, and returns its path and SHA-256 (hex).
func assemble(root, partsDir string, count int) (string, string, error) {
	tmpDir := filepath.Join(root, "tmp")
	if err := os.MkdirAll(tmpDir, 0o700); err != nil {
		return "", "", err
	}
	out, err := os.CreateTemp(tmpDir, "blob-*")
	if err != nil {
		return "", "", err
	}
	h := sha256.New()
	w := io.MultiWriter(out, h)
	for n := range count {
		in, err := os.Open(filepath.Join(partsDir, strconv.Itoa(n)))
		if err != nil {
			out.Close()
			os.Remove(out.Name())
			return "", "", err
		}
		_, err = io.Copy(w, in)
		in.Close()
		if err != nil {
			out.Close()
			os.Remove(out.Name())
			return "", "", err
		}
	}
	if err := out.Sync(); err != nil {
		out.Close()
		os.Remove(out.Name())
		return "", "", err
	}
	if err := out.Close(); err != nil {
		os.Remove(out.Name())
		return "", "", err
	}
	return out.Name(), hex.EncodeToString(h.Sum(nil)), nil
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// resetParts discards every received part so the client sends them again.
func (s *Service) resetParts(ctx context.Context, uploadID, partsDir string) error {
	if _, err := s.db.DB().ExecContext(ctx, "DELETE FROM upload_parts WHERE upload_id = ?", uploadID); err != nil {
		return err
	}
	if err := os.RemoveAll(partsDir); err != nil {
		return err
	}
	return os.MkdirAll(partsDir, 0o700)
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
