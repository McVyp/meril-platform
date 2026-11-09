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
  clientId: "api-gateway",
  brokers,
  ...auth,
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
