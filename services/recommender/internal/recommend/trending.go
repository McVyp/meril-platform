package recommend

import (
	"context"
	"slices"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

type trendingVideo struct {
	ID      string
	OwnerID string
	Score   float64
}
type trendingCache struct {
	mu        sync.Mutex
	videos    []trendingVideo
	fetchedAt time.Time
}

const (
	trendingCacheTTL  = time.Minute
	trendingCacheSize = 200
)

// distinct viewers (user of guest session) who watched atleast 3s in the last 7 days One person replaying a video still counts once.
const trendingQuery = `
	SELECT v.id, COALESCE(v."userId", '') AS owner_id,
		COUNT(DISTINCT COALESCE(i."userId", i."sessionId"))::float8 AS score
	FROM "Video" v
	LEFT JOIN "Interaction" i 
		ON i."videoId" = v.id
		AND i."occurredAt" > now() - interval '7 days'
		AND i."watchedDuration" >= 3
	WHERE v.status = 'READY'
	GROUP BY v.id
	ORDER BY score DESC, v."viewCount" DESC, v."createdAt" DESC
	LIMIT $1
`

func (e *Engine) Trending(ctx context.Context, limit int, ex Exclude) ([]ScoredVideo, error) {
	videos, err := e.trendingVideos(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]ScoredVideo, 0, limit)
	for _, v := range videos {
		if len(out) >= limit {
			break
		}
		if (ex.OwnerID != "" && v.OwnerID == ex.OwnerID) || slices.Contains(ex.VideoIDs, v.ID) {
			continue
		}
		out = append(out, ScoredVideo{ID: v.ID, Score: v.Score})
	}
	return out, nil
}

func (e *Engine) trendingVideos(ctx context.Context) ([]trendingVideo, error) {
	c := &e.trending
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.videos != nil && time.Since(c.fetchedAt) < trendingCacheTTL {
		return c.videos, nil
	}

	rows, err := e.db.Query(ctx, trendingQuery, trendingCacheSize)
	if err == nil {
		var videos []trendingVideo
		videos, err = pgx.CollectRows(rows, pgx.RowToStructByPos[trendingVideo])
		if err == nil {
			c.videos, c.fetchedAt = videos, time.Now()
			return videos, nil
		}
	}
	if c.videos != nil {
		return c.videos, nil
	}
	return nil, err
}
