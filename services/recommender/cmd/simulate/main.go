package main

import (
	"context"
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"slices"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	pgxvec "github.com/pgvector/pgvector-go/pgx"

	recommenderv1 "github.com/mcvyp/meril-platform/services/recommender/gen/meril/recommender/v1"
	"github.com/mcvyp/meril-platform/services/recommender/internal/recommend"
	"github.com/mcvyp/meril-platform/services/recommender/internal/server"
)

const (
	holdOut     = 2  // newest liked videos
	numSkips    = 3  // other topic videos
	maxK        = 10 // feed size
	historyDays = 14
	seed        = 42
	rounds      = 20 // repeat with different shuffles
)

type video struct {
	id       string
	topic    string
	duration int
}

type persona struct {
	name  string
	likes []string
}

type event struct {
	v       video
	watched int
}

var personas = []persona{
	{"trains", []string{"trains"}},
	{"foodies", []string{"food", "city"}},
	{"outdoors", []string{"animals", "nature"}},
	{"sports", []string{"sports"}},
	{"mixed", []string{"trains", "food", "sports"}},
}

type result struct {
	held                  int
	engine5, engine10     int
	trending5, trending10 int
}

func (r *result) add(o result) {
	r.held += o.held
	r.engine5 += o.engine5
	r.engine10 += o.engine10
	r.trending5 += o.trending5
	r.trending10 += o.trending10
}

func main() {
	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	if !strings.Contains(dbURL, "localhost") && !strings.Contains(dbURL, "127.0.0.1") {
		log.Fatal("refusing to run: DATABASE_URL is not a local database")
	}

	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("parse db url: %v", err)
	}
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return pgxvec.RegisterTypes(ctx, conn)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	if err := run(ctx, pool); err != nil {
		log.Printf("error: %v", err)
	}
	if err := cleanup(ctx, pool); err != nil {
		log.Printf("cleanup: %v", err)
	}
}

func run(ctx context.Context, pool *pgxpool.Pool) error {
	if err := cleanup(ctx, pool); err != nil {
		return err
	}
	videos, err := loadVideos(ctx, pool)
	if err != nil {
		return err
	}
	rng := rand.New(rand.NewPCG(seed, seed))
	perPersona := make([]result, len(personas))

	for round := 0; round < rounds; round++ {
		for i, p := range personas {
			var liked, others []video
			for _, v := range videos {
				if slices.Contains(p.likes, v.topic) {
					liked = append(liked, v)
				} else {
					others = append(others, v)
				}
			}
			if len(liked) <= holdOut {
				log.Printf("%s: only %d liked videos, skipping", p.name, len(liked))
				continue
			}

			rng.Shuffle(len(liked), func(i, j int) { liked[i], liked[j] = liked[j], liked[i] })
			rng.Shuffle(len(others), func(i, j int) { others[i], others[j] = others[j], others[i] })
			held, history := liked[:holdOut], liked[holdOut:]
			skipped := others[:min(numSkips, len(others))]

			watched, err := insertHistory(ctx, pool, p.name, history, skipped, rng)
			if err != nil {
				return err
			}

			engine := recommend.New(pool, nil)
			srv := server.New(engine)

			resp, err := srv.GetRecommendations(ctx, &recommenderv1.GetRecommendationsRequest{
				SessionId: "sim-" + p.name,
				Limit:     maxK,
			})
			if err != nil {
				return fmt.Errorf("%s: recommendations: %w", p.name, err)
			}
			var feed []string
			for _, it := range resp.Items {
				feed = append(feed, it.VideoId)
			}

			trend, err := engine.Trending(ctx, maxK, recommend.Exclude{VideoIDs: watched})
			if err != nil {
				return fmt.Errorf("%s: trending: %w", p.name, err)
			}
			var trendIDs []string
			for _, v := range trend {
				trendIDs = append(trendIDs, v.ID)
			}

			perPersona[i].add(result{
				held:       len(held),
				engine5:    hits(feed, held, 5),
				engine10:   hits(feed, held, 10),
				trending5:  hits(trendIDs, held, 5),
				trending10: hits(trendIDs, held, 10),
			})

			if err := cleanup(ctx, pool); err != nil {
				return err
			}
		}
	}

	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "persona\theld\tengine@5\tengine@10\ttrending@5\ttrending@10")

	var total result

	for i, p := range personas {
		r := perPersona[i]
		fmt.Fprintf(tw, "%s\t%d\t%d\t%d\t%d\t%d\n", p.name, r.held, r.engine5, r.engine10, r.trending5, r.trending10)
		total.add(r)
	}

	rate := func(n int) string {
		if total.held == 0 {
			return ""
		}
		return fmt.Sprintf("%.2f", float64(n)/float64(total.held))
	}
	fmt.Fprintf(tw, "hit rate\t%d\t%s\t%s\t%s\t%s\n", total.held, rate(total.engine5), rate(total.engine10), rate(total.trending5), rate(total.trending10))
	return tw.Flush()
}

func loadVideos(ctx context.Context, pool *pgxpool.Pool) ([]video, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, topic, COALESCE(duration, 30) FROM "Video"
		WHERE status = 'READY' AND topic IS NOT NULL
			AND embedding IS NOT NULL
		ORDER BY id
 	`)
	if err != nil {
		return nil, fmt.Errorf("load videos: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (video, error) {
		var v video
		err := row.Scan(&v.id, &v.topic, &v.duration)
		return v, err
	})
}

func insertHistory(ctx context.Context, pool *pgxpool.Pool, name string, liked, skipped []video, rng *rand.Rand) ([]string, error) {
	var events []event
	for _, v := range liked {
		ratio := 0.9 + 0.1*rng.Float64() // full watch
		if rng.IntN(4) == 0 {
			ratio = 0.4 + 0.3*rng.Float64() // partial
		}
		events = append(events, event{v, max(3, int(float64(v.duration)*ratio))})
	}

	for _, v := range skipped {
		events = append(events, event{v, min(2, v.duration)})
	}
	rng.Shuffle(len(events), func(i, j int) { events[i], events[j] = events[j], events[i] })

	start := time.Now().Add(-historyDays * 24 * time.Hour)
	step := historyDays * 24 * time.Hour / time.Duration(len(events)+1)
	ids := make([]string, 0, len(events))
	for i, e := range events {
		key := fmt.Sprintf("sim-%s-%d", name, i)
		_, err := pool.Exec(ctx, `
			INSERT INTO "Interaction" 
				(id, "eventId", "sessionId", "videoId", "watchedDuration", duration, "occurredAt")
			VALUES ($1, $1, $2, $3, $4, $5, $6)
		`, key, "sim-"+name, e.v.id, e.watched, e.v.duration, start.Add(time.Duration(i+1)*step))
		if err != nil {
			return nil, fmt.Errorf("insert history: %s: %w", key, err)
		}
		ids = append(ids, e.v.id)
	}
	return ids, nil
}

func hits(feed []string, held []video, k int) int {
	top := feed[:min(k, len(feed))]
	n := 0
	for _, h := range held {
		if slices.Contains(top, h.id) {
			n++
		}
	}
	return n
}

func cleanup(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `DELETE FROM "Interaction" WHERE "sessionId" LIKE 'sim-%'`)
	return err
}
