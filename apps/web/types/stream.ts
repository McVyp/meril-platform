export interface WsMessage {
  type: string;
  count?: number;
  playbackUrl?: string;
}

export interface StreamCredentials {
  ingestEndpoint: string;
  streamKey: string;
  playbackUrl: string;
}

export interface StudioStreamData extends StreamCredentials {
  id: string;
}

export interface PublicStream {
  id: string;
  title: string;
  description: string | null;
  status: string;
  playbackUrl: string | null;
  viewerCount: number;
  userId: string;
}
