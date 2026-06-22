import "./lib/env";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { db } from "./lib/db";
import { redis } from "./lib/redis";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: "ok", postgres: "connected", redis: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", message: (err as Error).message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`api-gateway running on :${PORT}`));
