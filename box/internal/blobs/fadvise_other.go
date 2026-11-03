//go:build !linux

package blobs

import "os"

// DropCache is a no-op off Linux; the box only runs on Linux.
func DropCache(*os.File) {}
