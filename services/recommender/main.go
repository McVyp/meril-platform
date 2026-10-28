package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	pgxvec "github.com/pgvector/pgvector-go/pgx"
	"github.com/redis/go-redis/v9"

	recommenderv1 "github.com/mcvyp/meril-platform/services/recommender/gen/meril/recommender/v1"
	"github.com/mcvyp/meril-platform/services/recommender/internal/recommend"
	"github.com/mcvyp/meril-platform/services/recommender/internal/server"
)

func main() {
	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "50051"
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("parse DATABASE_URL: %v", err)
	}
	// teach every connection about pgvector's vector type registration
	config.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return pgxvec.RegisterTypes(ctx, conn)
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatalf("create pool: %v", err)
	}
	defer pool.Close()

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := pool.Ping(pingCtx); err != nil {
		log.Fatalf("connect to postgres: %v", err)
	}

	var rdb *redis.Client
	if redisURL := os.Getenv("REDIS_URL"); redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Fatalf("parse REDIS_URL: %v", err)
		}
		rdb = redis.NewClient(opt)
		defer rdb.Close()
	} else {
		log.Println("REDIS_URL is not set, skipping Redis client initialization")
	}

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	recommenderv1.RegisterRecommenderServiceServer(grpcServer, server.New(recommend.New(pool, rdb)))
	reflection.Register(grpcServer)

	healthSrc := health.NewServer()
	healthpb.RegisterHealthServer(grpcServer, healthSrc)

	go func() {
		<-ctx.Done()
		healthSrc.Shutdown()
		log.Println("shutting down gRPC server...")
		grpcServer.GracefulStop()
	}()

	log.Printf("recommender listening on port %s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
