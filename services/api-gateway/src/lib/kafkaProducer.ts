import { Kafka, logLevel } from "kafkajs";

const kafka = new Kafka({
  clientId: "api-gateway",
  brokers: [process.env.CONFLUENT_BOOTSTRAP_SERVERS!],
  ssl: true,
  sasl: {
    mechanism: "plain",
    username: process.env.CONFLUENT_API_KEY!,
    password: process.env.CONFLUENT_API_SECRET!,
  },
  connectionTimeout: 10000,
  requestTimeout: 30000,
  logLevel: logLevel.WARN,
});

const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
let connected = false;

async function ensureConnected() {
  if (!connected) {
    await producer.connect();
    connected = true;
  }
}

export async function emitEvent(
  topic: string,
  payload: object,
  key?: string,
): Promise<void> {
  await ensureConnected();
  await producer.send({
    topic,
    messages: [{ key, value: JSON.stringify(payload) }],
  });
}
