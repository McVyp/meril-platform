import "dotenv/config";
import { consumer } from "./kafka/consumer";
import { handleVideoTranscodeCompleted } from "./handlers/videoTranscodeCompleted";
import { handleVideoViewed } from "./handlers/videoViewed";

const TOPIC_TRANSCODE = process.env.KAFKA_TOPIC_TRANSCODE!;
const TOPIC_VIEWED = process.env.KAFKA_TOPIC_VIEWED!;

async function main() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_TRANSCODE, fromBeginning: false });
  await consumer.subscribe({ topic: TOPIC_VIEWED, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const value = message.value?.toString();
      if (!value) return;

      if (topic === TOPIC_TRANSCODE) {
        await handleVideoTranscodeCompleted(value);
      } else if (topic === TOPIC_VIEWED) {
        await handleVideoViewed(value);
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
