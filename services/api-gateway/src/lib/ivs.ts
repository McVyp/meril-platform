import { IvsClient } from "@aws-sdk/client-ivs";

export const ivs = new IvsClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  credentials: {
    accessKeyId: process.env.AWS_IVS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_IVS_SECRET_ACCESS_KEY!,
  },
});