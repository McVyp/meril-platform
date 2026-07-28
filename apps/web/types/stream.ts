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

export interface PublicUser {
  id: string;
  name: string | null;
  image: string | null;
}

export interface PublicStream {
  id: string;
  title: string;
  description: string | null;
  status: string;
  playbackUrl: string | null;
  viewerCount: number;
  userId: string;
  user: PublicUser;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface UserProfile {
  user: PublicUser & {
    bio: string | null;
    bannerUrl: string | null;
    socialLinks: SocialLink[] | null;
  };
  followerCount: number;
  followingCount: number;
  videos: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    hlsUrl: string | null;
  }[];
}
