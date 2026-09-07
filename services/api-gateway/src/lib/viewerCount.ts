import { db } from "./db";
import { ivs } from "./ivs";
import { GetStreamCommand } from "@aws-sdk/client-ivs";
import { broadcastToRoom } from "./ws";

// viewerCount comes straight from GetStreamCommand — no need to hand-roll
// tracking from WebSocket connection counts. AWS reports new views within
// ~15s and drops within ~1min, so no point polling faster than that.
export function startViewerCount(): void {
  const VIEWER_COUNT_POLL_MS = 15_000;

  setInterval(async () => {
    try {
      const liveStreams = await db.stream.findMany({
        where: { status: "LIVE" },
        include: { user: { select: { ivsChannelArn: true } } },
      });

      await Promise.all(
        liveStreams.map(async (s) => {
          if (!s.user.ivsChannelArn) return;
          try {
            const { stream: ivsStream } = await ivs.send(
              new GetStreamCommand({ channelArn: s.user.ivsChannelArn }),
            );
            broadcastToRoom(s.id, {
              type: "VIEWER_COUNT",
              count: ivsStream?.viewerCount ?? 0,
            });
          } catch (err: any) {
            if (
              err.name !== "ChannelNotBroadcasting" &&
              err.Code !== "ChannelNotBroadcasting"
            ) {
              console.error(
                "Failed to fetch viewer count for stream:",
                s.id,
                err,
              );
            }
          }
        }),
      );
    } catch (err) {
      console.error("Viewer count poll failed:", err);
    }
  }, VIEWER_COUNT_POLL_MS);
}
