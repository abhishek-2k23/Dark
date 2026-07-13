import { writeFile } from "node:fs/promises";
import path from "node:path";

import { openApiDocument } from "../src/openapi";

/**
 * Writes the generated OpenAPI spec to docs/openapi.json at the repo root.
 * Run via `pnpm openapi:generate` (root or apps/api).
 */
async function main() {
  const outFile = path.resolve(__dirname, "../../../docs/openapi.json");
  await writeFile(outFile, JSON.stringify(openApiDocument, null, 2) + "\n");
  console.log(`OpenAPI spec written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
