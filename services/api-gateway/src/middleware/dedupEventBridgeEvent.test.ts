import express from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("dedupEventBridgeEvent (test database)", () => {
  let db: typeof import("../lib/db").db;
  let app: express.Express;

  const handled = vi.fn();
  let handlerStatus = 200;

  beforeAll(async () => {
    const dbName = new URL(TEST_DB!).pathname.slice(1);
    if (!dbName.endsWith("_test")) {
      throw new Error("TEST_DATABASE_URL must point to a test database");
    }
    process.env.DATABASE_URL = TEST_DB;
    ({ db } = await import("../lib/db"));
    const { dedupEventBridgeEvent } = await import("./dedupEventBridgeEvent");

    app = express()
      .use(express.json())
      .post("/hook", dedupEventBridgeEvent, (_req, res) => {
        handled();
        res.status(handlerStatus).json({});
      });
  });

  beforeEach(async () => {
    await db.processedEvent.deleteMany();
    handled.mockReset();
    handlerStatus = 200;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const deliver = () => request(app).post("/hook").send({ id: "event-1" });

  it("handles the first delivery", async () => {
    expect((await deliver()).status).toBe(200);
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it("answers a duplicate delivery without handling it again", async () => {
    await deliver();
    const res = await deliver();
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when handling fails, so the retry is processed", async () => {
    handlerStatus = 500;
    expect((await deliver()).status).toBe(500);

    await vi.waitFor(async () =>
      expect(await db.processedEvent.count()).toBe(0),
    );

    handlerStatus = 200;
    expect((await deliver()).status).toBe(200);
    expect(handled).toHaveBeenCalledTimes(2);
  });
});
