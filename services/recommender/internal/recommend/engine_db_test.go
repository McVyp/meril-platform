package recommend

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	pgxvec "github.com/pgvector/pgvector-go/pgx"
)

func unitVec(i int) []float32 {
	v := make([]float32, 384)
	v[i] = 1.0
	return v
}

func testEngine(t *testing.T) (*Engine, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	if u, err := url.Parse(dsn); err != nil || !strings.HasSuffix(u.Path, "_test") {
		t.Fatalf("TEST_DATABASE_URL must point to a test database, got %q", dsn)
	}
	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return pgxvec.RegisterTypes(ctx, conn)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	for _, table := range []string{`"Interaction"`, `"Video"`, `"User"`} {
		if _, err := pool.Exec(ctx, "DELETE FROM "+table); err != nil {
			t.Fatal(err)
		}
	}
	return New(pool, nil), pool
}

func addVideo(t *testing.T, db *pgxpool.Pool, id string, dir int, status, owner string) {
	t.Helper()
	var ownerArg any
	if owner != "" {
		ownerArg = owner
	}
	_, err := db.Exec(context.Background(),
		`INSERT INTO "Video" (id, title, status, embedding, "userId", "updatedAt") 
		VALUES ($1, $1, $2::text::"VideoStatus", $3, $4, now())`,
		id, status, pgvector.NewVector(unitVec(dir)), ownerArg)
	if err != nil {
		t.Fatal(err)
	}
}

func watch(t *testing.T, db *pgxpool.Pool, session, videoID string, watched, duration int) {
	t.Helper()
	id := fmt.Sprintf("%s-%s-%d", session, videoID, watched)
	_, err := db.Exec(context.Background(),
		`
		INSERT INTO "Interaction" (id, "eventId", "sessionId", "videoId", "watchedDuration", duration, "occurredAt")
		VALUES ($1, $1, $2, $3, $4, $5, now())
	`, id, session, videoID, watched, duration)
	if err != nil {
		t.Fatal(err)
	}
}

func TestTasteVectorFromWatchHistory(t *testing.T) {
	e, db := testEngine(t)
	addVideo(t, db, "liked", 0, "READY", "")
	addVideo(t, db, "skipped", 1, "READY", "")
	watch(t, db, "s1", "liked", 30, 30)
	watch(t, db, "s1", "skipped", 2, 30)

	taste, ids, err := e.TasteVector(context.Background(), "", "s1")
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 {
		t.Fatalf("watched ids -= %v, want 2", ids)
	}

	if taste[0] <= 0.9 || taste[1] >= 0 {
		t.Errorf("taste[0]=%v taste[1]=%v, want about 0.95 and below 0", taste[0], taste[1])
	}
}

func TestTasteVectorNilWhenEverythingWasSkipped(t *testing.T) {
	e, db := testEngine(t)
	addVideo(t, db, "skipped", 1, "READY", "")
	watch(t, db, "s1", "skipped", 2, 30)

	taste, _, err := e.TasteVector(context.Background(), "", "s1")
	if err != nil {
		t.Fatal(err)
	}
	if taste != nil {
		t.Error("taste should be nil without any positive signal (caller falls back to trending)")
	}
}

func TestNearestSkipsWatchedOwnAndUnready(t *testing.T) {
	e, db := testEngine(t)
	if _, err := db.Exec(context.Background(), `
		INSERT INTO "User" (id, email, "updatedAt")
		VALUES ('creator', 'creator@example.com', now())
	`); err != nil {
		t.Fatal(err)
	}
	addVideo(t, db, "watched", 0, "READY", "")
	addVideo(t, db, "own", 0, "READY", "creator")
	addVideo(t, db, "processing", 0, "PROCESSING", "")
	addVideo(t, db, "match", 0, "READY", "")
	addVideo(t, db, "unrelated", 1, "READY", "")

	got, err := e.Nearest(context.Background(), unitVec(0), 10, Exclude{VideoIDs: []string{"watched"}, OwnerID: "creator"})
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]string, len(got))
	for i, g := range got {
		ids[i] = g.ID
	}

	if len(ids) == 0 || ids[0] != "match" {
		t.Errorf("nearest ids = %v, want [match]", ids)
	}
	for _, bad := range []string{"watched", "own", "processing"} {
		if slices.Contains(ids, bad) {
			t.Errorf("nearest ids should not contain %q", bad)
		}
	}
}
