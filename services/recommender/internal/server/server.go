package server

import (
	"context"
	"log"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	recommenderv1 "github.com/mcvyp/meril-platform/services/recommender/gen/meril/recommender/v1"
	"github.com/mcvyp/meril-platform/services/recommender/internal/recommend"
)

const (
	defaultLimit = 20
	maxLimit     = 100
)

type Server struct {
	recommenderv1.UnimplementedRecommenderServiceServer
	engine *recommend.Engine
}

func New(engine *recommend.Engine) *Server {
	return &Server{engine: engine}
}

func (s *Server) GetRecommendations(ctx context.Context, req *recommenderv1.GetRecommendationsRequest) (*recommenderv1.GetRecommendationsResponse, error) {
	limit := int(req.GetLimit())
	if limit <= 0 {
		limit = defaultLimit
	} else if limit > maxLimit {
		limit = maxLimit
	}

	resp := &recommenderv1.GetRecommendationsResponse{}
	seen := make(map[string]bool)
	add := func(videos []recommend.ScoredVideo, source recommenderv1.Source) {
		for _, v := range videos {
			if len(resp.Items) >= limit || seen[v.ID] {
				continue
			}
			seen[v.ID] = true
			resp.Items = append(resp.Items, &recommenderv1.Recommendation{
				VideoId: v.ID,
				Score:   v.Score,
				Source:  source,
			})
		}
	}
	
	// personalized: videos similar to user's taste
	taste, _, err := s.engine.TasteVector(ctx, req.GetUserId(), req.GetSessionId())

	if err != nil {
		log.Printf("taste vector: %v", err)
	}
	if taste != nil {
		near, err := s.engine.Nearest(ctx, taste, limit)
		if err != nil {
			log.Printf("nearest: %v", err)
		} else {
			add(near, recommenderv1.Source_SOURCE_TASTE)
		}
	}

	// fill remaining slots with trending videos. Error only if no recommendations are available at all
	if len(resp.Items) < limit {
		trending, err := s.engine.Trending(ctx, limit+len(resp.Items))
		if err != nil {
			if len(resp.Items) == 0 {
				return nil, status.Errorf(codes.Internal, "trending: %v", err)
			}
			log.Printf("trending: %v", err)
		} else {
			add(trending, recommenderv1.Source_SOURCE_TRENDING)
		}
	}
	return resp, nil
}
