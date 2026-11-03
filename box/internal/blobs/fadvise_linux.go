package blobs

import (
	"os"

	"golang.org/x/sys/unix"
)

// dropCache asks Linux to forget the file's cached pages, so the next read
// comes from the drive rather than from memory. The file must already be
// fsynced (only clean pages are dropped). Best effort.
func dropCache(f *os.File) {
	_ = unix.Fadvise(int(f.Fd()), 0, 0, unix.FADV_DONTNEED)
}
