import "./lib/env";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { db } from "./lib/db";
import { redis } from "./lib/redis";
import { videoRouter } from "./routes/video";
import { streamRouter } from "./routes/streams";
import { setupWebSocket } from "./lib/ws";
import { authRouter } from "./routes/auth";
import { interactionsRouter } from "./routes/interactions";
import { followRouter } from "./routes/follows";
import { usersRouter } from "./routes/users";
import { startViewerCount } from "./lib/viewerCount";

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ inflate: false }));
app.use("/api/auth", authRouter);
app.use("/api/videos", videoRouter);
app.use("/api/streams", streamRouter);
app.use("/api", followRouter);
app.use("/api/users", usersRouter);
app.use("/api/interactions", interactionsRouter);

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
server.listen(PORT, () => {
  console.log(`api-gateway running on :${PORT}`);
  startViewerCount();
});
