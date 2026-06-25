export interface VideoData {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  hlsUrl: string | null;
  type: "video";
}

export interface ApiVideo {
  id: string;
  title: string;
  description: string | null;
  playbackUrl: string | null;
  hlsUrl: string | null;
}
