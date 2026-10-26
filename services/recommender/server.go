package main

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	recommenderv1 "github.com/mcvyp/meril-platform/services/recommender/gen/meril/recommender/v1"
)

const (
	defaultLimit = 20
	maxLimit     = 100
)

type server struct {
	recommenderv1.UnimplementedRecommenderServiceServer
	db *pgxpool.Pool
}

func (s *server) GetRecommendations(ctx context.Context, req *recommenderv1.GetRecommendationsRequest) (*recommenderv1.GetRecommendationsResponse, error) {
	limit := int(req.GetLimit())
	if limit <= 0 {
		limit = defaultLimit
	} else if limit > maxLimit {
		limit = maxLimit
	}

	rows, err := s.db.Query(ctx, `
		SELECT id::text
		FROM "Video"
		WHERE status = 'READY'
		ORDER BY "createdAt" DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "query videos: %v", err)
	}

	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, status.Errorf(codes.Internal, "read videos: %v", err)
	}

	resp := &recommenderv1.GetRecommendationsResponse{}
	for _, id := range ids {
		resp.Items = append(resp.Items, &recommenderv1.Recommendation{
			VideoId: id,
			Source:  recommenderv1.Source_SOURCE_UNSPECIFIED,
		})
	}
	return resp, nil
}
