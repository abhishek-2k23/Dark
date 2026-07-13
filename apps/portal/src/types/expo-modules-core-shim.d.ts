// expo-modules-core (SDK 56) ships only TS *source* — no built `build/` types —
// so its package `types` entry points at a missing file and TypeScript falls
// back to type-checking Expo's own source, which trips over an internal
// `invariant` import and a duplicate global `expo` declaration.
//
// We never import expo-modules-core directly; the Expo packages we use ship
// their own public `.d.ts`. So for the typecheck we resolve the module to this
// permissive stub (wired via tsconfig `paths`). Metro/Babel still bundle the
// real implementation from source at runtime — this only affects tsc.
declare const expoModulesCore: any;
export = expoModulesCore;
