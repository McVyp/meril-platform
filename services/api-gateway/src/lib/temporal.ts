import { Client, Connection } from "@temporalio/client";

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
    if (client) return client;

    const temporalHost = process.env.TEMPORAL_HOST ?? "localhost:7233";
    const temporalNamespace = process.env.TEMPORAL_NAMESPACE ?? "default";
    const temporalApiKey = process.env.TEMPORAL_API_KEY;

    const connection = await Connection.connect({
        address: temporalHost,
        tls: temporalApiKey ? true : false,
        metadata: temporalApiKey
            ? { authorization: `Bearer ${temporalApiKey}` }
            : undefined,
    });

    client = new Client({
        connection,
        namespace: temporalNamespace,
    });

    return client;
}