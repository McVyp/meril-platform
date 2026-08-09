import { Kafka, logLevel } from "kafkajs";

const kafka = new Kafka({
  clientId: "event-consumer",
  brokers: [process.env.CONFLUENT_BOOTSTRAP_SERVERS!],
  ssl: true,
  sasl: {
    mechanism: "plain",
    username: process.env.CONFLUENT_API_KEY!,
    password: process.env.CONFLUENT_API_SECRET!,
  },
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
  logLevel: logLevel.WARN,
});

export const consumer = kafka.consumer({ groupId: "event-consumer-group-v2" });
