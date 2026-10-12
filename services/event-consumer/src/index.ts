import "dotenv/config";
import { consumer } from "./kafka/consumer";
import { handleVideoTranscodeCompleted } from "./handlers/videoTranscodeCompleted";
import { handleVideoViewed } from "./handlers/videoViewed";
import { PermanentError } from "./lib/errors";
import { sendToDLQ } from "./lib/dlq";

const TOPIC_TRANSCODE = process.env.KAFKA_TOPIC_TRANSCODE!;
const TOPIC_VIEWED = process.env.KAFKA_TOPIC_VIEWED!;

const MAX_ATTEMPTS = 5;

const handlers: Record<string, (raw: string) => Promise<void>> = {
  [TOPIC_TRANSCODE]: handleVideoTranscodeCompleted,
  [TOPIC_VIEWED]: handleVideoViewed,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_TRANSCODE, fromBeginning: false });
  await consumer.subscribe({ topic: TOPIC_VIEWED, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message, partition, heartbeat }) => {
      const value = message.value?.toString();
      if (!value) return;

      const handler = handlers[topic];
      if (!handler) return;

      for(let attempt = 1; ;attempt++){
        try {
          await handler(value);
          return;
        }
        catch(err){
          const permanent = err instanceof PermanentError;
          if (permanent || attempt >= MAX_ATTEMPTS) {
            console.error(`[${topic}] sending offet ${message.offset} to DLQ after ${attempt} attempt(s):`, err);
            await sendToDLQ(topic, partition, message.offset, message.key, value, err);
            return;
          }
          console.warn(`[${topic}] attempt ${attempt} failed, will retry:`, err);
          await sleep(Math.min(500 * 2 ** (attempt - 1), 8000));
          await heartbeat();

        }

      }
    },
  });
}

main().catch((err) => {
  console.error("event-consumer crashed:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await consumer.disconnect();
  process.exit(0);
});
