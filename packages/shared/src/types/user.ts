export type UserRole = "VIEWER" | "STREAMER" | "ADMIN";

export interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role: UserRole;
}
