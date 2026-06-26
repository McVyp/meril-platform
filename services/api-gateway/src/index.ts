import "./lib/env";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { db } from "./lib/db";
import { redis } from "./lib/redis";
import { videoRouter } from "./routes/video";
import { streamRouter } from "./routes/stream";
import { setupWebSocket } from "./lib/ws";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use("/api/videos", videoRouter);
app.use("/api/streams", streamRouter);

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
const server = http.createServer(app);
setupWebSocket(server);
server.listen(PORT, () => console.log(`api-gateway running on :${PORT}`));
 
