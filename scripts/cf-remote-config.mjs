// Generates `.wrangler-remote.jsonc` for running D1 migrations against a real
// Cloudflare account (outside the Sites platform). Everything is env-driven so
// the file can be regenerated and never needs hand editing.
//
//   CF_WORKER_NAME        Worker/script name (default: inspiration-tree-ai-mindmap)
//   CF_D1_DATABASE_NAME   D1 database name   (default: inspiration-tree-ai-mindmap)
//   CF_D1_DATABASE_ID     D1 database id     (required — from `wrangler d1 create`)
//
// The generated file is git-ignored; it only wires the DB binding + migrations
// dir so `wrangler d1 migrations apply ... --remote` can find them.
import { writeFileSync } from "node:fs";

const workerName = process.env.CF_WORKER_NAME || "inspiration-tree-ai-mindmap";
const databaseName = process.env.CF_D1_DATABASE_NAME || "inspiration-tree-ai-mindmap";
const databaseId = process.env.CF_D1_DATABASE_ID;

if (!databaseId) {
  console.error(
    "CF_D1_DATABASE_ID is required. Run `npm run cf:d1:create` first, then export the printed database id.",
  );
  process.exit(1);
}

const config = {
  name: workerName,
  d1_databases: [
    {
      binding: "DB",
      database_name: databaseName,
      database_id: databaseId,
      migrations_dir: "./drizzle",
    },
  ],
};

writeFileSync(".wrangler-remote.jsonc", `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote .wrangler-remote.jsonc for D1 "${databaseName}" (${databaseId}).`);
