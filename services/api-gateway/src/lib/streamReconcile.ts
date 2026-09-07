import { db } from "./db";
import { ivs } from "./ivs";
import { GetStreamCommand } from "@aws-sdk/client-ivs";

export async function reconcileActiveStreams(): Promise<
  Map<string, { status: string; playbackUrl: string | null }>
> {
  const active = await db.stream.findMany({
    where: { status: { in: ["OFFLINE", "LIVE"] } },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { ivsPlaybackUrl: true, ivsChannelArn: true } },
    },
  });

  const latestIdByChannel = new Map<string, string>();
  for (const s of active) {
    if (!s.user.ivsChannelArn) continue;
    if (!latestIdByChannel.has(s.user.ivsChannelArn)) {
      latestIdByChannel.set(s.user.ivsChannelArn, s.id);
    }
  }

  const result = new Map<
    string,
    { status: string; playbackUrl: string | null }
  >();

  await Promise.all(
    active.map(async (s) => {
      const playbackUrl = s.user.ivsPlaybackUrl;
      const isLatestForChannel =
        !!s.user.ivsChannelArn &&
        latestIdByChannel.get(s.user.ivsChannelArn) === s.id;

      if (s.status === "LIVE" && s.user.ivsChannelArn && !isLatestForChannel) {
        await db.stream.update({
          where: { id: s.id },
          data: { status: "ENDED", endedAt: new Date() },
        });
        result.set(s.id, { status: "ENDED", playbackUrl });
        return;
      }

      if (s.status === "LIVE" && s.user.ivsChannelArn) {
        try {
          const { stream: ivsStream } = await ivs.send(
            new GetStreamCommand({ channelArn: s.user.ivsChannelArn }),
          );
          if (ivsStream?.state !== "LIVE") {
            await db.stream.update({
              where: { id: s.id },
              data: { status: "ENDED", endedAt: new Date() },
            });
            result.set(s.id, { status: "ENDED", playbackUrl });
            return;
          }
        } catch (e: any) {
          if (
            e.name === "ChannelNotBroadcasting" ||
            e.Code === "ChannelNotBroadcasting"
          ) {
            await db.stream.update({
              where: { id: s.id },
              data: { status: "ENDED", endedAt: new Date() },
            });
            result.set(s.id, { status: "ENDED", playbackUrl });
            return;
          }
          console.error("Reconcile check failed for stream", s.id, e);
        }
      } else if (
        s.status === "OFFLINE" &&
        s.user.ivsChannelArn &&
        isLatestForChannel
      ) {
        try {
          const { stream: ivsStream } = await ivs.send(
            new GetStreamCommand({ channelArn: s.user.ivsChannelArn }),
          );
          if (ivsStream?.state === "LIVE") {
            await db.stream.update({
              where: { id: s.id },
              data: { status: "LIVE", startedAt: new Date() },
            });
            result.set(s.id, { status: "LIVE", playbackUrl });
            return;
          }
        } catch (e: any) {
          if (
            e.name !== "ChannelNotBroadcasting" &&
            e.Code !== "ChannelNotBroadcasting"
          ) {
            console.error("Reconcile check failed for stream", s.id, e);
          }
        }
      }

      result.set(s.id, { status: s.status, playbackUrl });
    }),
  );

  return result;
}
