import { db } from "../lib/db";
import { getTemporalClient } from "../lib/temporal";

const DRY_RUN = process.argv.includes("--dry-run");

interface VideoRow {
  id: string;
  title: string;
  description: string | null;
}

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL!).host;
  console.log(`Database: ${dbHost}${DRY_RUN ? " (dry run)" : ""}`);

  const videos = await db.$queryRaw<VideoRow[]>`
    SELECT "id", "title", "description"
    FROM "Video"
    WHERE "status" = 'READY' AND "embedding" IS NULL
    ORDER BY "createdAt" ASC
`;

  console.log(`Found ${videos.length} video(s) without an embedding`);

  if (DRY_RUN) {
    for (const v of videos) console.log(` would embed ${v.id} ${v.title}`);
    return;
  }

  const temporal = await getTemporalClient();
  for (const v of videos) {
    await temporal.workflow.start("EmbedVideoWorkflow", {
      args: [v.id, v.title, v.description ?? null],
      taskQueue: "media-processor",
      workflowId: `embed-${v.id}`,
      workflowIdConflictPolicy: "TERMINATE_EXISTING",
    });
    console.log(` started embed-${v.id} ${v.title}`);
  }
  console.log("Done, check Temporal UI for progress.");
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
