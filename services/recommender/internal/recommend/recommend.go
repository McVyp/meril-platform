package recommend

import "github.com/jackc/pgx/v5/pgxpool"

// computes recommendations from Postgres
type Engine struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Engine {
	return &Engine{db: db}
}

type ScoredVideo struct {
	ID    string
	Score float64
}

type Exclude struct {
	VideoIDs []string
	OwnerID  string
}
