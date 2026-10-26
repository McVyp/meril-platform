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
	defaultLimit  = 20
	maxLimit      = 100
	minTasteScore = 0.2
	sessionBlend  = 0.5
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
	taste, watchedIDs, err := s.engine.TasteVector(ctx, req.GetUserId(), req.GetSessionId())

	if err != nil {
		log.Printf("taste vector: %v", err)
	}
	exclude := recommend.Exclude{VideoIDs: watchedIDs, OwnerID: req.GetUserId()}

	recent := s.engine.RecentViews(ctx, req.GetUserId(), req.GetSessionId())
	for _, v := range recent {
		exclude.VideoIDs = append(exclude.VideoIDs, v.VideoID)
	}

	sessionVec, err := s.engine.SessionVector(ctx, recent)
	if err != nil {
		log.Printf("session vector: %v", err)
	}

	tasteSource := recommenderv1.Source_SOURCE_TASTE
	if taste == nil && sessionVec != nil {
		tasteSource = recommenderv1.Source_SOURCE_SESSION
	}
	taste = recommend.Blend(taste, sessionVec, sessionBlend)

	if req.GetUserId() != "" {
		followed, err := s.engine.FromFollowed(ctx, req.GetUserId(), max(1, limit/4), exclude)
		if err != nil {
			log.Printf("from followed: %v", err)
		} else {
			add(followed, recommenderv1.Source_SOURCE_FOLLOWING)
		}
	}
	if taste != nil {
		near, err := s.engine.Nearest(ctx, taste, limit, exclude)
		if err != nil {
			log.Printf("nearest: %v", err)
		} else {
			matches := make([]recommend.ScoredVideo, 0, len(near))
			for _, v := range near {
				if v.Score >= minTasteScore {
					matches = append(matches, v)
				}
			}
			add(matches, tasteSource)
		}
	}

	// fill remaining slots with trending videos. Error only if no recommendations are available at all
	for _, ex := range []recommend.Exclude{exclude, {OwnerID: req.GetUserId()}} {
		if len(resp.Items) >= limit {
			break
		}
		trending, err := s.engine.Trending(ctx, limit+len(resp.Items), ex)
		if err != nil {
			log.Printf("trending: %v", err)
			continue
		}
		add(trending, recommenderv1.Source_SOURCE_TRENDING)
	}
	if len(resp.Items) == 0 {
		return nil, status.Errorf(codes.NotFound, "no recommendations available")
	}
	return resp, nil
}
