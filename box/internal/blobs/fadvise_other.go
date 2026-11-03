//go:build !linux

package blobs

import "os"

// dropCache is a no-op off Linux; the box only runs on Linux.
func dropCache(*os.File) {}
