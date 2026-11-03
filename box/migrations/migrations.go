// Package migrations embeds boxd's numbered SQL migrations (NNNN_name.sql).
// Never edit an applied migration; add a new file instead (docs/05).
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
