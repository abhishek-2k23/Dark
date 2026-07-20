import { Accelerometer } from "expo-sensors";
import { useEffect, useRef } from "react";

/**
 * Fires `onShake` when the device is shaken hard and repeatedly.
 *
 * The bar is deliberately high. This drives a panic alarm that wakes a whole
 * society, so a phone jostled in a pocket, set down hard, or carried on a
 * scooter must not trip it. Three things keep that from happening:
 *
 *  - Magnitude is measured against gravity, so only real acceleration counts.
 *  - A single spike is ignored; it takes `SHAKES_NEEDED` of them inside
 *    `WINDOW_MS` to count, which a bump can't produce but a shaken hand can.
 *  - After firing, the detector goes quiet for `COOLDOWN_MS` — a hard shake
 *    keeps producing spikes long after the user meant one gesture.
 */

/** g-force above resting gravity that counts as a spike. */
const THRESHOLD_G = 1.7;
/** Spikes required, and the window they must fall inside. */
const SHAKES_NEEDED = 3;
const WINDOW_MS = 1500;
/** Silence after a fire, so one gesture is one alarm. */
const COOLDOWN_MS = 3000;
/** Minimum gap between counted spikes — one shake is not three samples. */
const SPIKE_GAP_MS = 120;
const SAMPLE_MS = 100;

export interface ShakeDetectorOptions {
  /** Set false to unsubscribe entirely — e.g. while the SOS sheet is already up. */
  enabled?: boolean;
}

export function useShakeDetector(
  onShake: () => void,
  { enabled = true }: ShakeDetectorOptions = {},
): void {
  // Read the newest callback without re-subscribing to the sensor on every
  // render — resubscribing drops the in-progress spike window.
  const onShakeRef = useRef(onShake);
  useEffect(() => {
    onShakeRef.current = onShake;
  }, [onShake]);

  useEffect(() => {
    if (!enabled) return;

    let spikes: number[] = [];
    let mutedUntil = 0;
    let lastSpike = 0;

    Accelerometer.setUpdateInterval(SAMPLE_MS);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const now = Date.now();
      if (now < mutedUntil) return;

      // Resting magnitude is ~1g in whatever direction is down; subtracting it
      // leaves the part that came from actual movement.
      const force = Math.sqrt(x * x + y * y + z * z) - 1;
      if (force < THRESHOLD_G) return;
      if (now - lastSpike < SPIKE_GAP_MS) return;

      lastSpike = now;
      spikes = [...spikes.filter((t) => now - t < WINDOW_MS), now];

      if (spikes.length >= SHAKES_NEEDED) {
        spikes = [];
        mutedUntil = now + COOLDOWN_MS;
        onShakeRef.current();
      }
    });

    return () => sub.remove();
  }, [enabled]);
}
