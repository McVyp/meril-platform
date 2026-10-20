export interface VideoData {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  hlsUrl: string | null;
  type: "video" | "live";
  isAiGenerated: boolean;
}

export interface ApiVideo {
  id: string;
  title: string;
  description: string | null;
  playbackUrl: string | null;
  hlsUrl: string | null;
  isAiGenerated?: boolean;
}

export interface ApiStream {
  id: string;
  title: string;
  description: string | null;
  status: string;
  playbackUrl: string | null;
  viewerCount: number;
}
