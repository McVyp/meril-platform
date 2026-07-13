import { IvschatClient } from "@aws-sdk/client-ivschat";

const accessKeyId = process.env.AWS_IVS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_IVS_SECRET_ACCESS_KEY;

if (!accessKeyId || !secretAccessKey) {
  throw new Error(
    "Missing AWS_IVS_ACCESS_KEY_ID or AWS_IVS_SECRET_ACCESS_KEY env vars",
  );
}

export const ivschat = new IvschatClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
