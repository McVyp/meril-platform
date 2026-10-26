package main

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type scoredVideo struct {
	ID    string
	Score float64
}

const trendingQuery = `
	SELECT v.id, COUNT(i.id)::float8 AS score
	FROM "Video" v
	LEFT JOIN "Interaction" i 
		ON i."videoId" = v.id
		AND i."occurredAt" > now() - interval '7 days'
	WHERE v.status = 'READY'
	GROUP BY v.id
	ORDER BY score DESC, v."viewCount" DESC, v."createdAt" DESC
	LIMIT $1
`

func (s *server) trending(ctx context.Context, limit int) ([]scoredVideo, error) {
	rows, err := s.db.Query(ctx, trendingQuery, limit)
	if err != nil {
		return nil, err
	}

	return pgx.CollectRows(rows, pgx.RowToStructByPos[scoredVideo])
}