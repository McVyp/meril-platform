import { Kafka, logLevel } from "kafkajs";

const brokers = (
  process.env.KAFKA_BROKERS ?? process.env.CONFLUENT_BOOTSTRAP_SERVERS!
).split(",");
const username = process.env.CONFLUENT_API_KEY;
const password = process.env.CONFLUENT_API_SECRET;
const auth =
  username && password
    ? { ssl: true, sasl: { mechanism: "plain" as const, username, password } }
    : { ssl: false };

const kafka = new Kafka({
  clientId: "event-consumer",
  brokers,
  ...auth,
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
  logLevel: logLevel.WARN,
});

export const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || "event-consumer-group-v2",
});
