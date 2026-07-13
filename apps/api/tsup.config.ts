import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./src/index.ts"],
  noExternal: [/^@repo\//], // bundle workspace packages (e.g. @repo/trpc, @repo/logger) into the build
  // Native/engine modules must NOT be bundled — they load platform-specific
  // binaries (argon2 prebuilds, the Prisma query engine) that a bundle can't
  // resolve. Kept external and required from node_modules at runtime; both are
  // direct deps of this app so pnpm's isolated layout can resolve them.
  external: ["argon2", "@prisma/client", ".prisma/client", "@prisma/engines"],
  splitting: false,
  bundle: true,
  // Shim import.meta.url / __dirname in the CJS output. Some deps do
  // `createRequire(import.meta.url)`, which is `undefined` in a plain CJS
  // bundle and throws at load without this.
  shims: true,
  outDir: "./dist",
  clean: true,
  env: { IS_SERVER_BUILD: "true" },
  loader: { ".json": "copy" },
  minify: true,
  sourcemap: false,
});
