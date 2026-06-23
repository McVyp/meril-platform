export interface VideoData {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  type: "video";
}

export interface ApiVideo {
  id: string;
  title: string;
  description: string | null;
  playbackUrl: string | null;
}
