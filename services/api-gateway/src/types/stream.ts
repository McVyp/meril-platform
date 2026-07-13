export interface CreateStreamBody {
  title: string;
  description?: string;
  userId: string;
}

export interface PatchStreamBody {
  title?: string;
  description?: string;
}

export interface ChatTokenBody {
  username: string;
}

export interface EventBridgeIvsEvent {
  "detail-type": "IVS Stream Start" | "IVS Stream End" | string;
  resources?: string[];
}