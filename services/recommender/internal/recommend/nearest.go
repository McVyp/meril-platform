package recommend

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/pgvector/pgvector-go"
)

// closest videos to the taste vector by cosine distance ( uses the HNSW index)
const nearestQuery = `
	SELECT id, 1 - (embedding <=> $1) AS score
	FROM "Video" 
	WHERE status = 'READY' AND embedding IS NOT NULL
		AND id <> ALL(COALESCE($3::text[], '{}'))
		AND ($4::text = '' OR "userId" IS DISTINCT FROM $4)
	ORDER BY embedding <=> $1
	LIMIT $2
`

// nearest returns the vidoes most similart to taste; score is cosine similarity (1 = identical)
func (e *Engine) Nearest(ctx context.Context, taste []float32, limit int, ex Exclude) ([]ScoredVideo, error) {
	rows, err := e.db.Query(ctx, nearestQuery, pgvector.NewVector(taste), limit, ex.VideoIDs, ex.OwnerID)
	if err != nil {
		return nil, err
	}

	return pgx.CollectRows(rows, pgx.RowToStructByPos[ScoredVideo])
}
