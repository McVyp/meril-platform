package recommend

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// distinct viewers (user of guest session) who watched atleast 3s in the last 7 days One person replaying a video still counts once.
const trendingQuery = `
	SELECT v.id, COUNT(DISTINCT COALESCE(i."userId", i."sessionId"))::float8 AS score
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

func (s *Engine) Trending(ctx context.Context, limit int) ([]ScoredVideo, error) {
	rows, err := s.db.Query(ctx, trendingQuery, limit)
	if err != nil {
		return nil, err
	}

	return pgx.CollectRows(rows, pgx.RowToStructByPos[ScoredVideo])
}
