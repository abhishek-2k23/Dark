import { Platform } from "react-native";

/**
 * Thin, crash-proof wrapper over expo-local-authentication.
 *
 * The module is loaded through a deferred, guarded `require` rather than a
 * top-level `import` on purpose. expo-local-authentication resolves its native
 * module with `requireNativeModule` — which *throws at module-evaluation time*
 * on any binary that doesn't ship it. A top-level import would make that throw
 * cascade through biometricStore → the root layout and white-screen the whole
 * app. That matters because this JS can reach an OTA update running on an older
 * binary that predates the native module (our runtimeVersion policy is
 * "appVersion", so updates aren't fenced off by native fingerprint). Deferring
 * the require and catching the throw degrades that case to "biometrics
 * unavailable" instead of a crash. The feature simply lights up once users are
 * on a build that includes the native module.
 */

type LocalAuthModule = typeof import("expo-local-authentication");

// undefined = not tried yet; null = tried and absent on this binary.
let cached: LocalAuthModule | null | undefined;

function loadModule(): LocalAuthModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require("expo-local-authentication") as LocalAuthModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export interface BiometricInfo {
  /** Hardware present AND at least one biometric enrolled on this device. */
  available: boolean;
  /** Friendly name for the enrolled method: "Face ID", "Fingerprint", … */
  label: string;
}

/** Generic fallback when we can't name the specific method. */
const GENERIC_LABEL = "Biometrics";

function labelFor(
  mod: LocalAuthModule,
  types: number[],
): string {
  const { AuthenticationType } = mod;
  // Face first: on phones that have both, it's the primary gesture.
  if (types.includes(AuthenticationType.FACIAL_RECOGNITION)) {
    return Platform.OS === "ios" ? "Face ID" : "Face Unlock";
  }
  if (types.includes(AuthenticationType.FINGERPRINT)) {
    return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
  }
  if (types.includes(AuthenticationType.IRIS)) return "Iris";
  return GENERIC_LABEL;
}

/** Capability probe: is app-lock offerable, and what should we call it? */
export async function getBiometricInfo(): Promise<BiometricInfo> {
  const mod = loadModule();
  if (!mod) return { available: false, label: GENERIC_LABEL };
  try {
    const hasHardware = await mod.hasHardwareAsync();
    const enrolled = await mod.isEnrolledAsync();
    const types = await mod.supportedAuthenticationTypesAsync();
    return { available: hasHardware && enrolled, label: labelFor(mod, types) };
  } catch {
    return { available: false, label: GENERIC_LABEL };
  }
}

/**
 * Present the biometric prompt. Resolves true only on a verified match.
 *
 * Device passcode fallback stays enabled: a failed face scan (bad light, a
 * mask) must not brick access to the owner's own app.
 */
export async function authenticate(promptMessage: string): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  try {
    const result = await mod.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
