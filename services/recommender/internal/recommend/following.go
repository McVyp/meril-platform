package recommend

import (
	"context"

	"github.com/jackc/pgx/v5"
)

const followingQuery = `
	SELECT v.id, 1::float8 AS score
	FROM "Video" v
	JOIN "Follow" f ON f."followingId" = v."userId"
	WHERE f."followerId" = $1
		AND v.status = 'READY'
		AND v."createdAt" > now() - interval '30 days'
		AND v.id <> ALL(COALESCE($3::text[], '{}'))
	ORDER BY v."createdAt" DESC
	LIMIT $2
`

func (e *Engine) FromFollowed(ctx context.Context, userID string, limit int, ex Exclude) ([]ScoredVideo, error) {
	if userID == "" {
		return nil, nil
	}
	rows, err := e.db.Query(ctx, followingQuery, userID, limit, ex.VideoIDs)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[ScoredVideo])
}
