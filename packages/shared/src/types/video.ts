export type VideoStatus =
  "UPLOADING" | "PROCESSING" | "TRANSCODING" | "READY" | "FAILED";

export interface Video {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: VideoStatus;
  hlsUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}
