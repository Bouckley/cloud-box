// Package blobs stores encrypted blobs on the main drive and runs resumable
// uploads. The box only ever handles ciphertext: it checks sizes and SHA-256
// hashes, never contents.
package blobs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// Upload limits (ADR 0004).
const (
	PartBytes    = 8 << 20
	MaxBlobBytes = 64 << 30
	ReserveBytes = 1 << 30
	UploadTTL    = 24 * time.Hour
)

var (
	// ErrStorageFull means the main drive cannot hold the blob plus ReserveBytes.
	ErrStorageFull = errors.New("storage full")
	// ErrBadPart means a part number is out of range or the part has the wrong size.
	ErrBadPart = errors.New("bad part")
	// ErrUploadIncomplete means complete was called before every part arrived.
	ErrUploadIncomplete = errors.New("upload incomplete")
	// ErrHashMismatch means the assembled blob's SHA-256 differs from the declared one.
	ErrHashMismatch = errors.New("hash mismatch")
)

// Blob is a stored blob.
type Blob struct {
	ID         string
	SHA256     string
	Size       int64
	StoredAt   time.Time
	VerifiedAt *time.Time
}

// State is "verified" once the re-read hash matched, otherwise "stored".
func (b Blob) State() string {
	if b.VerifiedAt != nil {
		return "verified"
	}
	return "stored"
}

// Service stores blobs and runs uploads.
type Service struct {
	db  *store.Store
	hal hal.HAL

	// locks serialize work on one upload: parts take a read lock (they write
	// separate byte ranges), complete and reset take the write lock. Striped
	// by upload id so memory stays fixed however many uploads there are.
	locks [64]sync.RWMutex
}

func (s *Service) lock(uploadID string) *sync.RWMutex {
	h := fnv.New32a()
	_, _ = h.Write([]byte(uploadID))
	return &s.locks[h.Sum32()%uint32(len(s.locks))]
}

// diskErr turns "no space left on device" into ErrStorageFull (507) and
// returns every other error unchanged.
func diskErr(err error) error {
	if errors.Is(err, syscall.ENOSPC) {
		return fmt.Errorf("%w: %v", ErrStorageFull, err)
	}
	return err
}

// New returns the blob service.
func New(db *store.Store, h hal.HAL) *Service {
	return &Service{db: db, hal: h}
}

// BlobPath is where a blob lives under a drive root: blobs/<id[0:2]>/<id[2:4]>/<id>.
func BlobPath(root, blobID string) string {
	return filepath.Join(root, "blobs", blobID[0:2], blobID[2:4], blobID)
}

func (s *Service) mainRoot(ctx context.Context) (string, hal.Drive, error) {
	d, err := s.hal.Drive(ctx, hal.RoleMain)
	if err != nil {
		return "", hal.Drive{}, err
	}
	return d.Path, d, nil
}

func newBoxID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// syncDir fsyncs a directory so a rename into it survives a power cut.
func syncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}

func millis(t *time.Time, ms int64) {
	*t = time.UnixMilli(ms).UTC()
}
