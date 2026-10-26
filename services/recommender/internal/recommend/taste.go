package recommend

import (
	"context"
	"math"

	"github.com/jackc/pgx/v5"
	"github.com/pgvector/pgvector-go"
)

type watchedVideo struct {
	Embedding    pgvector.Vector
	MaxWatched   int
	TotalWatched int
	Duration     int
}

const tasteQuery = `
	SELECT v.embedding,
		max(i."watchedDuration") AS max_watched,
		sum(i."watchedDuration") AS total_watched,
		max(i.duration) AS duration
	FROM "Interaction" i
	JOIN "Video" v ON v.id = i."videoId"
	WHERE v.embedding IS NOT NULL
		AND CASE WHEN $1::text <> '' THEN i."userId" = $1 ELSE i."sessionId" = $2 END
		AND i."occurredAt" > now() - interval '90 days'
	GROUP BY v.id
	ORDER BY max(i."occurredAt") DESC
	LIMIT 50
`

// watchWeight computes the weight of a watched video based on how much of it was watched relative to its duration. -1 for skip, upto 3 for a full watch
func watchWeight(maxWatched, totalWatched, duration int) float32 {
	if maxWatched < 3 {
		return -1
	}

	if duration <= 0 {
		return 0.5
	}
	ratio := float64(totalWatched) / float64(duration)
	switch {
	case ratio < 0.3:
		return 0.5
	case ratio < 0.8:
		return 1.5
	default:
		return 3
	}
}

// TasteVector computes the taste vector for a user or session based on watched videos.
func (e *Engine) TasteVector(ctx context.Context, userID, sessionID string) ([]float32, int, error) {
	if userID == "" && sessionID == "" {
		return nil, 0, nil
	}

	rows, err := e.db.Query(ctx, tasteQuery, userID, sessionID)
	if err != nil {
		return nil, 0, err
	}

	watched, err := pgx.CollectRows(rows, pgx.RowToStructByPos[watchedVideo])
	if err != nil {
		return nil, 0, err
	}

	var taste []float32
	hasPositive := false
	for _, w := range watched {
		emb := w.Embedding.Slice()
		if taste == nil {
			taste = make([]float32, len(emb))
		}
		weight := watchWeight(w.MaxWatched, w.TotalWatched, w.Duration)
		if weight > 0 {
			hasPositive = true
		}
		for j, x := range emb {
			taste[j] += weight * x
		}
	}
	if !hasPositive || !normalize(taste) {
		return nil, len(watched), nil
	}
	return taste, len(watched), nil
}

// normalize scales v to length 1; false if v is all zeros or too close to zero
func normalize(v []float32) bool {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	norm := math.Sqrt(sum)
	if norm < 1e-6 {
		return false
	}
	for i := range v {
		v[i] = float32(float64(v[i]) / norm) // scale to length 1
	}
	return true
}
