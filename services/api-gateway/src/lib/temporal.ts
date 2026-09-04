import { Client, Connection } from "@temporalio/client";

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  const temporalHost = process.env.TEMPORAL_HOST ?? "localhost:7233";
  const temporalNamespace = process.env.TEMPORAL_NAMESPACE ?? "default";

  const connection = await Connection.connect({
    address: temporalHost,
    tls: false,
  });

  client = new Client({
    connection,
    namespace: temporalNamespace,
  });

  return client;
}
