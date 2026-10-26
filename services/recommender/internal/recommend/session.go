package recommend

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pgvector/pgvector-go"
)

type RecentView struct {
	VideoID string  `json:"videoId"`
	Ratio   float64 `json:"ratio"`
}

type videoEmbedding struct {
	ID        string
	Embedding pgvector.Vector
}

const redisTimeout = 100 * time.Millisecond
const sessionQuery = `
	SELECT id, embedding
	FROM "Video"
	WHERE id = ANY($1) AND embedding IS NOT NULL
`

// scores a recent view ratio into a weight for blending; under 10% counts as skip
func ratioWeight(ratio float64) float32 {
	switch {
	case ratio < 0.1:
		return -1
	case ratio < 0.3:
		return 0.5
	case ratio < 0.8:
		return 1.5
	default:
		return 3
	}
}

// mixes long-term and session vectors with a given weight
func Blend(long, session []float32, w float32) []float32 {
	if session == nil {
		return long
	}
	if long == nil {
		return session
	}
	out := make([]float32, len(long))
	for i := range long {
		out[i] = (1-w)*long[i] + w*session[i]
	}
	if !normalize(out) {
		return long
	}
	return out
}

// reads recent views for a user or session from Redis
func (e *Engine) RecentViews(ctx context.Context, userID, sessionID string) []RecentView {
	if e.rdb == nil {
		return nil
	}
	var keys []string
	if userID != "" {
		keys = append(keys, "recent:user:"+userID)
	}
	if sessionID != "" {
		keys = append(keys, "recent:session:"+sessionID)
	}

	ctx, cancel := context.WithTimeout(ctx, redisTimeout)
	defer cancel()

	var views []RecentView
	for _, key := range keys {
		raw, err := e.rdb.LRange(ctx, key, 0, -1).Result()
		if err != nil {
			log.Printf("recent views: %v", err)
			return nil
		}
		for _, s := range raw {
			var v RecentView
			if json.Unmarshal([]byte(s), &v) == nil && v.VideoID != "" {
				views = append(views, v)
			}
		}
	}
	return views
}

// computes a session vector from recent views, weighted by view ratios
func (e *Engine) SessionVector(ctx context.Context, views []RecentView) ([]float32, error) {
	if len(views) == 0 {
		return nil, nil
	}

	ratios := make(map[string]float64)
	ids := make([]string, 0, len(views))
	for _, v := range views {
		if _, ok := ratios[v.VideoID]; !ok {
			ids = append(ids, v.VideoID)
		}
		ratios[v.VideoID] += v.Ratio
	}
	rows, err := e.db.Query(ctx, sessionQuery, ids)
	if err != nil {
		return nil, err
	}
	videos, err := pgx.CollectRows(rows, pgx.RowToStructByPos[videoEmbedding])
	if err != nil {
		return nil, err
	}

	var vec []float32
	hasPositive := false
	for _, v := range videos {
		emb := v.Embedding.Slice()
		if vec == nil {
			vec = make([]float32, len(emb))
		}
		weight := ratioWeight(ratios[v.ID])
		if weight > 0 {
			hasPositive = true
		}
		for j, x := range emb {
			vec[j] += weight * x
		}
	}

	if !hasPositive || !normalize(vec) {
		return nil, nil
	}

	return vec, nil
}
