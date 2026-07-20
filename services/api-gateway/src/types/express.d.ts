import type { User } from "../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sub: string;
        username?: string;
      };
      dbUser?: User;
    }
  }
}

export {};
