import { IVSRealTimeClient } from "@aws-sdk/client-ivs-realtime";

const accessKeyId = process.env.AWS_IVS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_IVS_SECRET_ACCESS_KEY;

if (!accessKeyId || !secretAccessKey) {
  throw new Error("Missig AWS IVS credentials in environment");
}
export const ivsRealtime = new IVSRealTimeClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
