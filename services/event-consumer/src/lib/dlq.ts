import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const DLQ_URL = process.env.DLQ_URL!;
const sqs = new SQSClient({ region: process.env.AWS_REGION });

export const sendToDLQ = async (
  sourceTopic: string,
  partition: number,
  offset: string,
  key: Buffer | null,
  value: string,
  err: unknown,
): Promise<void> => {
  const attr = (v: string) => ({ DataType: "String", StringValue: v });
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: DLQ_URL,
      MessageBody: value,
      MessageAttributes: {
        sourceTopic: attr(sourceTopic),
        partition: attr(String(partition)),
        offset: attr(offset),
        ...(key && { key: attr(key.toString()) }),
        error: attr((err instanceof Error ? err.message : String(err)).slice(
          0,
          1000,
        )),
        failedAt: attr(new Date().toISOString()),
      },
    }),
  );
};
