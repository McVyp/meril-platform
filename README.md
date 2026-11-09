# Meril

Meril is a live streaming platform supporting both desktop (RTMP) and mobile (WHIP) broadcasting.

## Stack

| Layer                                              | Technology                               |
| -------------------------------------------------- | ---------------------------------------- |
| Frontend                                           | Next.js (Vercel)                         |
| API                                                | Express `api-gateway`                    |
| Database                                           | Postgres                                 |
| Rate limiting / session layer                      | Redis (in-memory fallback)               |
| Media (RTMP/WHIP Ingest, transcoding, playback)    | AWS IVS                                  |
| Real-time / multi-participant                      | AWS IVS Real-Time (Stages, Compositions) |
| Chat                                               | AWS IVS Chat                             |
| Event routing                                      | AWS EventBridge                          |
| Auth                                               | AWS Cognito                              |
| Storage / CDN                                      | AWS S3 + CloudFront                      |
| Workflow Orchestration                             | Temporal                                 |
| Background processing                              | `media-processor` worker                 |
| Recommendations                                    | Go service (gRPC) + pgvector             |
| Search & embeddings                                | pg_trgm + pgvector, MiniLM embedder      |
| Async events (view tracking, transcode completion) | Confluent Cloud (Kafka)                  |
| Monorepo tooling                                   | pnpm                                     |

## High-level System Design

<img width="972" height="681" alt="meril-90 drawio" src="https://github.com/user-attachments/assets/36ae1a33-87b3-4104-8d76-1f353b6b4562" />

Clients connect to Meril app, which branches into three service areas - Auth (Cognito-backed token verification), Live Stream (desktop RTMP /mobile WHIP into AWS IVS, with IVS Chat), and Video Upload (presigned S3 upload feeding a Temporal transcode workflow). EventBridge routes IVS state-change events back into the app, with Redis handling both rate limiting and webhook dedup, and a full SQS DLQ -> CloudWatch -> SNS alerting chain for failed webhook deliveries. Video views and transcode-completion events flow through Kafka into a shared event-consumer, writing to the same Postgres database used by the rest of the app. Playback (both live and VOD) is served back to clients via CloudFront.

## Mobile go-live pipeline

WebRTC ingest through a Stage, composited into a Channel, with event-driven state updates.

```mermaid
sequenceDiagram
    participant M as Mobile Client
    participant AG as api-gateway
    participant DB as Postgres
    participant IVS as AWS IVS Real-Time
    participant EB as EventBridge

    M->>AG: POST /api/streams/mobile
    AG->>DB: ensure User has Channel, Encoder Config, Chat Room
    AG->>IVS:  CreateStageCommand
    IVS-->>AG:  stage.arn
    AG->>DB:  create Stream, store ivsStageArn
    AG->>M:  stream

    M->>AG: GET /:id/mobile-token
    AG->>IVS: CreateParticipantTokenCommand
    IVS-->>AG: participant token
    AG-->>M: token

    M->>AG: POST /:id/whip-publish (SDP offer)
    AG->>IVS: WHIP POST to global.whip.live-video.net<br />(follows 307 redirect)
    IVS-->>AG: SDP answer
    AG-->>M: SDP answer
    M->>IVS: WebRTC media flows to Stage

    IVS->>EB: "IVS Stage Update" / "Participant Published"
    EB->>AG: POST /webhook-realtime<br />x-webhook-secret header
    AG->>AG: verifyEventBridgeAuth (timingSafeEqual)
    AG->>DB: INSERT ProcessedEvent (event.id as primary key)
    alt duplicate event
        DB-->>AG: unique violation
        AG-->>EB: 200 {duplicate: true}
    else new event
        DB-->>AG: claimed
        AG->>DB: find Stream by ivsStageArn
        AG->>IVS: StartCompositionCommand<br />(Stage -> Channel + Encoder Config)
        IVS-->>AG: composition.arn
        AG->>DB: store ivsCompositionId
        AG-->>EB: 200 {received: true}
    end

    Note over EB, AG: On failure after retries, <br />event routes to SQS DLQ<br />meril-webhook-dlq → CloudWatch alarm
```

## Webhook Dedup + DLQ

```mermaid
flowchart LR
    A[EventBridge Rule] -->|success| B[API Destination]
    A -->|exhausted retries<br />3 attempts, 1hr max age | DLQ[(SQS DLQ<br />meril-webhook-dlq)]
    DLQ -->Alarm[CloudWatch Alarm<br/>ApproximateNumberOfMessagesVisible > 0]
    Alarm --> SNS[SNS Topic<br/>meril-dlq-alerts]
    SNS --> Email[Email notification]

    B --> Auth{verifyEventBridgeAuth<br/>x-webhook-secret match?}
    Auth -->|no| R401[401 Unauthorized]
    Auth -->|yes| Claim{dedupEventBridgeEvent<br/>INSERT ProcessedEvent}
    Claim -->|id already stored| R200D[200 duplicate: true]
    Claim -->|database error| R500[500, EventBridge retries]
    Claim -->|claimed| Handler[Route handler]
    Handler -->|5xx| Release[claim released, <br/>retry is processed]
    Handler --> DB[(Postgres)]
```

**Design notes:**

- `verifyEventBridgeAuth` compares the webhook secret with `crypto.timingSafeEqual` (constant-time), after checking the byte length, so wrong or unusual input gets a 401 instead of leaking timing or causing an error.
- The DLQ is a safety net, not the primary path - most events should never reach it. Its only job is to make otherwise-silent failures visible via the CloudWatch alarm.
- Dedup uses a `ProcessedEvent` table keyed by the event id, so Postgres rejects a second delivery of the same event. If the handler fails (5xx), the row is deleted, so EventBridge's retry gets processed.

## Rate Limiting

Express middleware backed by Redis: a fixed-window counter (`INCR` + `EXPIRE` ... `NX` in one `MULTI`), `429` with `retryAfter` once over the limit. If Redis is unavailable, it falls back to an in-memory counter per process, so the limit is approximate but never off.

```mermaid
flowchart LR
  Req[Incoming request] --> RL{rateLimit middleware <br />Redis INCR + EXPIRE NX}
  RL -->|under limit| Handler[Route handler]
  RL -->|over limit| R429[429 Too Many Requests<br/>+ retryAfter]
  RL -->|Redis error| Mem{in-memory fallback}
  Mem -->|under limit| Handler
  Mem -->|over limit| R429
```

| Route                                       | Window | Max requests | Key                             |
| ------------------------------------------- | ------ | ------------ | ------------------------------- |
| `POST /api/streams/` (desktop go-live)      | 60s    | 3            | per user                        |
| `POST /api/streams/mobile` (mobile go-live) | 60s    | 3            | per user                        |
| `GET /api/streams/:id/mobile-token`         | 60s    | 5            | per user                        |
| `POST /api/streams/:id/chat-token`          | 60s    | 10           | per IP (guests have no user id) |
| `GET /api/videos/search` (search)           | 60s    | 60           | per IP                          |
| `POST /api/videos/:id/view` (view tracking) | 60s    | 60           | per IP                          |

## Video upload & Transcode Pipeline

```mermaid
sequenceDiagram
    participant U as Browser (Upload Page)
    participant AG as api-gateway
    participant S3 as S3 (raw bucket)
    participant DB as Postgres
    participant T as Temporal
    participant MP as media-processor

    U->>AG: POST /upload-url {fileName, contentType, fileSize}
    AG-->>U: {videoId, presignedUrl, s3Key}
    U->>S3: PUT file directly (presigned URL)
    S3-->>U: 200 OK
    U->>AG: POST / {videoId, title, s3Key}
    AG->>DB: create Video row (status: PROCESSING)
    AG->>T: start TranscodeWorkflow(s3Key)
    alt workflow fails to start
        T-->>AG: error
        AG->>DB: update Video status: FAILED
    end
    AG-->>U: 201 {video}

    T->>MP: dispatch transcode_to_hls activity
    MP->>S3: read raw file, transcode
    MP->>S3: write HLS output
    MP-->>T: activity result
```

## Local development

1. Start infrastructure:

```bash
  docker compose -f infra/docker-compose.yml up postgres redis temporal temporal-ui -d
```

2. Start each service

```bash
  cd services/api-gateway && npx tsx watch src/index.ts
  cd services/media-processor && uv run python -m src.worker
  cd services/event-consumer && npx tsx watch src/index.ts
  cd apps/web && pnpm dev
```

Once running:

- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`
- Temporal UI: `http://localhost:8080`
