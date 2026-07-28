export interface CreatorItem {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  type: "creator";
}

export interface ApiCreator {
  id: string;
  name: string | null;
  bannerUrl: string | null;
  latestVideoUrl: string | null;
}
