package library

import (
	"context"
	"database/sql"
	"maps"
	"testing"

	"pgregory.net/rapid"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

// TestSyncNeverLosesOrDuplicates (Review Focus 5): whatever mix of creates,
// edits, trashes and purges happens between partial syncs, a client that
// applies every page (upsert items, drop purged ids) ends with exactly the
// server's items at their latest seq, and no page repeats an id.
func TestSyncNeverLosesOrDuplicates(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	rapid.Check(t, func(rt *rapid.T) {
		sess := f.addSession(t) // a fresh user per run isolates runs
		col := f.album(t, sess.UserID)
		var live []string // server item ids, for picking targets
		client := map[string]int64{}
		var cursor int64

		syncPage := func(limit int) bool {
			ch, err := f.svc.Changes(ctx, sess.UserID, cursor, limit)
			if err != nil {
				rt.Fatal(err)
			}
			seen := map[string]bool{}
			for _, it := range ch.Items {
				if seen[it.ID] {
					rt.Fatalf("page repeats item %s", it.ID)
				}
				seen[it.ID] = true
				if it.Seq <= cursor {
					rt.Fatalf("item seq %d not after cursor %d", it.Seq, cursor)
				}
				client[it.ID] = it.Seq
			}
			for _, id := range ch.Purged {
				if seen[id] {
					rt.Fatalf("page has %s as both item and purged", id)
				}
				seen[id] = true
				delete(client, id)
			}
			if len(seen) > limit {
				rt.Fatalf("page has %d entries, limit %d", len(seen), limit)
			}
			if ch.Cursor < cursor {
				rt.Fatalf("cursor went back: %d → %d", cursor, ch.Cursor)
			}
			cursor = ch.Cursor
			return ch.More
		}
		pick := func(rt *rapid.T) (string, int, bool) {
			if len(live) == 0 {
				return "", 0, false
			}
			i := rapid.IntRange(0, len(live)-1).Draw(rt, "target")
			return live[i], i, true
		}

		rt.Repeat(map[string]func(*rapid.T){
			"create": func(rt *rapid.T) {
				it, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, col))
				if err != nil {
					rt.Fatal(err)
				}
				live = append(live, it.ID)
			},
			"edit": func(rt *rapid.T) {
				if id, _, ok := pick(rt); ok {
					if _, err := f.svc.UpdateItem(ctx, sess.UserID, id, ItemPatch{MetadataEnc: randBytes(60)}); err != nil {
						rt.Fatal(err)
					}
				}
			},
			"trash": func(rt *rapid.T) { // direct SQL until Task 13
				if id, _, ok := pick(rt); ok {
					f.tx(rt, func(tx *sql.Tx) error {
						seq, err := store.NextSeq(ctx, tx)
						if err != nil {
							return err
						}
						_, err = tx.Exec("UPDATE items SET trashed_at = 1, seq = ? WHERE id = ?", seq, id)
						return err
					})
				}
			},
			"purge": func(rt *rapid.T) { // direct SQL until Task 13
				if id, i, ok := pick(rt); ok {
					f.tx(rt, func(tx *sql.Tx) error {
						seq, err := store.NextSeq(ctx, tx)
						if err != nil {
							return err
						}
						if _, err := tx.Exec("DELETE FROM items WHERE id = ?", id); err != nil {
							return err
						}
						_, err = tx.Exec("INSERT INTO tombstones (item_id, owner_id, seq) VALUES (?, ?, ?)", id, sess.UserID, seq)
						return err
					})
					live = append(live[:i], live[i+1:]...)
				}
			},
			"partial sync": func(rt *rapid.T) {
				syncPage(rapid.IntRange(1, 5).Draw(rt, "limit"))
			},
		})

		for syncPage(rapid.IntRange(1, 5).Draw(rt, "final limit")) {
		}
		server := map[string]int64{}
		rows, err := f.db.DB().Query("SELECT id, seq FROM items WHERE owner_id = ?", sess.UserID)
		if err != nil {
			rt.Fatal(err)
		}
		for rows.Next() {
			var id string
			var seq int64
			_ = rows.Scan(&id, &seq)
			server[id] = seq
		}
		rows.Close()
		if !maps.Equal(client, server) {
			rt.Fatalf("client %v != server %v", client, server)
		}
	})
}

func (f *fixture) tx(rt *rapid.T, fn func(*sql.Tx) error) {
	if err := f.db.Tx(context.Background(), fn); err != nil {
		rt.Fatal(err)
	}
}
