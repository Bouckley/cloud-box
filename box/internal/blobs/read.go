package blobs

import (
	"context"
	"os"
)

// Open opens one of the user's blobs for reading. Another user's or an
// unknown blob is store.ErrNotFound. The caller closes the file.
func (s *Service) Open(ctx context.Context, userID, blobID string) (*os.File, Blob, error) {
	b, err := s.blob(ctx, userID, blobID)
	if err != nil {
		return nil, Blob{}, err
	}
	root, _, err := s.mainRoot(ctx)
	if err != nil {
		return nil, Blob{}, err
	}
	f, err := os.Open(BlobPath(root, blobID))
	if err != nil {
		return nil, Blob{}, err
	}
	return f, b, nil
}
