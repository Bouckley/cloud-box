// Package status answers "is my stuff safe?" truthfully and drives the
// status light. Safe means every item outside Trash has a verified copy on a
// backup drive that is plugged in now, and nothing needs the owner's attention.
package status

import (
	"context"
	"database/sql"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/library"
	"github.com/Bouckley/cloud-box/box/internal/replica"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// lowStoragePercent: below this much free space on the main drive, warn.
const lowStoragePercent = 10

// Service builds status summaries.
type Service struct {
	db  *store.Store
	hal hal.HAL
	lib *library.Service
	rep *replica.Service
}

// New returns the status service.
func New(db *store.Store, h hal.HAL, lib *library.Service, rep *replica.Service) *Service {
	return &Service{db: db, hal: h, lib: lib, rep: rep}
}

// Summary mirrors the OpenAPI Status schema.
type Summary struct {
	Safe       bool
	Items      ItemCounts
	Devices    []Device
	Drives     []Drive
	LastCopyAt *time.Time
	Warnings   []Warning
}

// ItemCounts counts items; all but Trashed are items outside Trash.
type ItemCounts struct {
	Total, Verified, Replicated, NotYetCopied, Trashed int
}

// Device is one of the user's active devices and its newest item's time.
type Device struct {
	ID           string
	NameEnc      []byte
	LastBackupAt *time.Time
}

// Drive is a plugged-in drive.
type Drive struct {
	Role                 string
	SizeBytes, FreeBytes uint64
}

// Warning uses the API error shape; Message and Action are plain language.
type Warning struct {
	Code, Message, Action string
}

var (
	warnBackupMissing = Warning{
		Code:    "backup_missing",
		Message: "The backup drive is not plugged in, so your files have only one copy.",
		Action:  "Plug the backup drive back into the box.",
	}
	warnStorageLow = Warning{
		Code:    "storage_low",
		Message: "The box is almost full.",
		Action:  "Delete things you no longer need and empty Trash, or add a bigger drive.",
	}
)

// Summary is the user's status.
func (s *Service) Summary(ctx context.Context, userID string) (Summary, error) {
	sum, _, err := s.build(ctx, []string{userID})
	if err != nil {
		return Summary{}, err
	}
	if sum.Devices, err = s.devices(ctx, userID); err != nil {
		return Summary{}, err
	}
	return sum, nil
}

// build sums item counts over users and adds drives, warnings and safe. It
// also reports whether the main drive is present.
func (s *Service) build(ctx context.Context, userIDs []string) (Summary, bool, error) {
	sum := Summary{Devices: []Device{}, Drives: []Drive{}, Warnings: []Warning{}}
	for _, id := range userIDs {
		c, err := s.lib.StateCounts(ctx, id)
		if err != nil {
			return sum, false, err
		}
		sum.Items.Verified += c.Verified
		sum.Items.Replicated += c.Replicated
		sum.Items.Total += c.Stored + c.Verified + c.Replicated
		var trashed int
		if err := s.db.DB().QueryRowContext(ctx,
			"SELECT COUNT(*) FROM items WHERE owner_id = ? AND trashed_at IS NOT NULL", id).Scan(&trashed); err != nil {
			return sum, false, err
		}
		sum.Items.Trashed += trashed
	}
	sum.Items.NotYetCopied = sum.Items.Total - sum.Items.Replicated

	drives, err := s.hal.Drives.List(ctx)
	if err != nil {
		return sum, false, err
	}
	mainPresent, backupPresent := false, false
	for _, d := range drives {
		sum.Drives = append(sum.Drives, Drive{Role: d.Role, SizeBytes: d.SizeBytes, FreeBytes: d.FreeBytes})
		switch d.Role {
		case hal.RoleMain:
			mainPresent = true
		case hal.RoleBackup:
			backupPresent = true
		}
	}
	if !backupPresent {
		sum.Warnings = append(sum.Warnings, warnBackupMissing)
	}
	if lowStorage(drives) {
		sum.Warnings = append(sum.Warnings, warnStorageLow)
	}
	if sum.LastCopyAt, err = s.rep.LastCopyAt(ctx); err != nil {
		return sum, false, err
	}
	sum.Safe = mainPresent && len(sum.Warnings) == 0 && sum.Items.NotYetCopied == 0
	return sum, mainPresent, nil
}

func lowStorage(drives []hal.Drive) bool {
	for _, d := range drives {
		if d.Role == hal.RoleMain && d.SizeBytes > 0 && d.FreeBytes*100 < d.SizeBytes*lowStoragePercent {
			return true
		}
	}
	return false
}

func (s *Service) devices(ctx context.Context, userID string) ([]Device, error) {
	rows, err := s.db.DB().QueryContext(ctx, `SELECT d.id, d.name_enc,
		(SELECT MAX(i.created_at) FROM items i WHERE i.device_id = d.id AND i.owner_id = d.user_id)
		FROM devices d WHERE d.user_id = ? AND d.revoked_at IS NULL ORDER BY d.created_at, d.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Device{}
	for rows.Next() {
		var d Device
		var last sql.NullInt64
		if err := rows.Scan(&d.ID, &d.NameEnc, &last); err != nil {
			return nil, err
		}
		if last.Valid {
			t := time.UnixMilli(last.Int64).UTC()
			d.LastBackupAt = &t
		}
		list = append(list, d)
	}
	return list, rows.Err()
}

// LightFor is what the light shows: fault without the main drive, steady
// when safe, attention otherwise.
func LightFor(s Summary, mainPresent bool) hal.LightState {
	switch {
	case !mainPresent:
		return hal.Fault
	case s.Safe && len(s.Warnings) == 0 && s.Items.NotYetCopied == 0:
		return hal.SafeSteady
	default:
		return hal.Attention
	}
}

// UpdateLight sets the light from the whole box's status (every user).
func (s *Service) UpdateLight(ctx context.Context) error {
	rows, err := s.db.DB().QueryContext(ctx, "SELECT id FROM users")
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	sum, mainPresent, err := s.build(ctx, ids)
	if err != nil {
		return err
	}
	return s.hal.Light.Set(LightFor(sum, mainPresent))
}
