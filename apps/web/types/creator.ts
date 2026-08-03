export interface ApiCreator {
  id: string;
  name: string | null;
  username: string | null;
  bannerUrl: string | null;
  latestVideoUrl?: string | null;
}

export interface CreatorItem {
  id: string;
  username: string | null;
  title: string;
  description: string;
  videoUrl: string | null | undefined;
  type: "creator";
}
