export type WSEventType =
  | "stream:live"
  | "stream:offline"
  | "stream:viewer_count"
  | "video:ready"
  | "video:failed";

export interface WSEvent<T = unknown> {
  type: WSEventType;
  payload: T;
  timestamp: string;
}
