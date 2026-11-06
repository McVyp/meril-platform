import express from "express";
import request from "supertest";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterAll,
  beforeAll,
} from "vitest";
import { embedQuery } from "../lib/embedder";
import { getRecommendations } from "../lib/recommender";

const TEST_DB = process.env.TEST_DATABASE_URL;

vi.mock("../lib/redis", () => {
  const chain = {
    incr: () => chain,
    expire: () => chain,
    exec: async () => [
      [null, 1],
      [null, 1],
    ],
  };
  return { redis: { multi: () => chain, ttl: async () => 60 } };
});

vi.mock("../lib/kafkaProducer", () => ({ emitEvent: vi.fn() }));
vi.mock("../lib/temporal", () => ({ getTemporalClient: vi.fn() }));
vi.mock("../lib/recommender", () => ({ getRecommendations: vi.fn() }));
vi.mock("../lib/embedder", () => ({ embedQuery: vi.fn() }));
vi.mock("../middleware/auth", () => ({
  optionalAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const unit = (i: number) =>
  Array.from({ length: 384 }, (_, j) => (j === i ? 1 : 0));

describe.skipIf(!TEST_DB)("video routes (test database)", () => {
  let app: express.Express;
  let db: typeof import("../lib/db").db;

  async function addVideo(
    title: string,
    direction: number,
    status: "READY" | "PROCESSING" = "READY",
  ) {
    const v = await db.video.create({
      data: { title, status, hlsUrl: "https://example.com/v.m3u8" },
    });
    const vec = `[${unit(direction).join(",")}]`;
    await db.$executeRaw`UPDATE "Video" SET embedding = ${vec}::vector WHERE id = ${v.id}`;
    return v;
  }

  const titles = (res: request.Response) =>
    res.body.videos.map((v: { title: string }) => v.title);

  beforeAll(async () => {
    const dbName = new URL(TEST_DB!).pathname.slice(1);
    if (!dbName.endsWith("_test")) {
      throw new Error("TEST_DATABASE_URL must point to a test database");
    }
    process.env.DATABASE_URL = TEST_DB;
    ({ db } = await import("../lib/db"));
    const { videoRouter } = await import("./video");
    app = express().use("/api/videos", videoRouter);
  });

  beforeEach(async () => {
    await db.video.deleteMany();
    vi.mocked(embedQuery).mockReset();
    vi.mocked(getRecommendations).mockReset();
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("falls back to keyword search when the embedder is down", async () => {
    await addVideo("Train window", 0);
    await addVideo("Ramen at night", 1);
    vi.mocked(embedQuery).mockRejectedValue(new Error("embedder is down"));

    const res = await request(app).get("/api/videos/search?q=train");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("keyword");
    expect(titles(res)).toEqual(["Train window"]);
  });
  it("finds a video by meaning even without the word (hybrid)", async () => {
    await addVideo("Level crossing at dusk", 0);
    await addVideo("Ramen at night", 1);
    vi.mocked(embedQuery).mockResolvedValue(unit(0));

    const res = await request(app).get("/api/videos/search?q=railway");
    expect(res.body.mode).toBe("hybrid");
    expect(titles(res)).toEqual(["Level crossing at dusk"]);
  });

  it("only returns READY videos", async () => {
    await addVideo("Train window", 0, "PROCESSING");
    vi.mocked(embedQuery).mockResolvedValue(unit(0));

    const res = await request(app).get("/api/videos/search?q=train");
    expect(res.body.videos).toEqual([]);
  });

  it("rejects an empty query", async () => {
    expect((await request(app).get("/api/videos/search?q=")).status).toBe(400);
  });

  it("/recommended keeps the recommender's order", async () => {
    const first = await addVideo("First", 0);
    const second = await addVideo("Second", 1);
    vi.mocked(getRecommendations).mockResolvedValue([second.id, first.id]);

    const res = await request(app).get("/api/videos/recommended");
    expect(res.body.source).toBe("recommender");
    expect(titles(res)).toEqual(["Second", "First"]);
  });

  it("/recommended falls back to the newest READY videos if the recommender is down", async () => {
    const older = await addVideo("Older", 0);
    await addVideo("Newer", 1);
    await addVideo("Still processing", 2, "PROCESSING");

    await db.video.update({
      where: { id: older.id },
      data: { createdAt: new Date(Date.now() - 1000 * 60 * 60) },
    });
    vi.mocked(getRecommendations).mockRejectedValue(
      new Error("recommender is down"),
    );

    const res = await request(app).get("/api/videos/recommended");
    expect(res.body.source).toBe("fallback");
    expect(titles(res)).toEqual(["Newer", "Older"]);
  });
});
