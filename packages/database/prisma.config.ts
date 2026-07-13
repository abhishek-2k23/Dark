import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load the monorepo root .env so DATABASE_URL is available to the CLI.
config({ path: path.join(__dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx seed.ts",
  },
});
