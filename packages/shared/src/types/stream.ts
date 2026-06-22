export type StreamStatus = "OFFLINE" | "LIVE" | "ENDED";

export interface Stream {
  id: string;
  userId: string;
  title: string;
  status: StreamStatus;
  channelArn?: string;
  playbackUrl?: string;
  viewerCount: number;
  startedAt?: string;
  endedAt?: string;
}
