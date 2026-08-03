export interface VideoData {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  hlsUrl: string | null;
  type: "video" | "live";
}

export interface ApiVideo {
  id: string;
  title: string;
  description: string | null;
  playbackUrl: string | null;
  hlsUrl: string | null;
}

export interface ApiStream {
  id: string;
  title: string;
  description: string | null;
  status: string;
  playbackUrl: string | null;
  viewerCount: number;
}
