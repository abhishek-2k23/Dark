// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];
// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Defer module evaluation to first use.
//
// Expo ships `inlineRequires: false`. With it off, every module in the bundle is
// evaluated during startup, so the launch pays for the PDF renderer, the
// spreadsheet parser, the QR encoder and every screen the user may never open.
// Turning it on rewrites imports into requires at their first use site, which
// is the largest single lever on time-to-interactive here.
//
// The trade: modules whose *import order* has side effects can shift. This app's
// side-effect imports (`global.css`, `@/i18n`) bind nothing, so Babel leaves
// them as top-level requires. Still worth a launch smoke-test after changing —
// deleting these four lines reverts it.
config.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: true, inlineRequires: true },
});

// 4. Enable NativeWind (Tailwind CSS for React Native) with our global stylesheet.
module.exports = withNativeWind(config, { input: "./global.css" });
