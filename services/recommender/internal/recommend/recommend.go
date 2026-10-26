package recommend

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// computes recommendations from Postgres
type Engine struct {
	db       *pgxpool.Pool
	rdb      *redis.Client
	trending trendingCache
}

func New(db *pgxpool.Pool, rdb *redis.Client) *Engine {
	return &Engine{db: db, rdb: rdb}
}

type ScoredVideo struct {
	ID    string
	Score float64
}

type Exclude struct {
	VideoIDs []string
	OwnerID  string
}
