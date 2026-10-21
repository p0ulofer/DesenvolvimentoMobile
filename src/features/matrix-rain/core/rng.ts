/**
 * Deterministic pseudo-random utilities.
 *
 * Why not `Math.random()`? The activity asks for "truly random" characters, colors,
 * fonts and speeds. `Math.random()` is fine at *seeding* time, but the per-frame
 * animation (thousands of decisions per second) needs something that is:
 *   - fast and allocation-free,
 *   - reproducible from a seed (so a "Reshuffle" button can recreate an identical
 *     session, and so CPU and GPU renderers can show the same storm),
 *   - usable inside a Reanimated worklet (UI thread), where `Math.random()` state is
 *     not shared with the JS thread.
 *
 * We therefore seed a `mulberry32` PRNG from `Math.random()` once per session and use
 * a stateless integer hash for everything that happens per-frame/per-glyph.
 */

/** Seeded mulberry32 PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit integer hash of 2 inputs (stateless, worklet-safe). */
export function hash2(x: number, y: number): number {
  'worklet';
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 32-bit integer hash of 3 inputs (stateless, worklet-safe). */
export function hash3(x: number, y: number, z: number): number {
  'worklet';
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Maps a 32-bit hash to a float in [0, 1). */
export function hashUnit(h: number): number {
  'worklet';
  return (h >>> 0) / 4294967296;
}

/** Integer in [min, max] using a PRNG. */
export function randInt(next: () => number, min: number, max: number): number {
  return min + Math.floor(next() * (max - min + 1));
}

/** Float in [min, max) using a PRNG. */
export function randRange(next: () => number, min: number, max: number): number {
  return min + next() * (max - min);
}

/** Picks a random element from a non-empty array. */
export function pick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(next() * items.length))];
}

/** Fresh random 32-bit seed (uses the platform CSPRNG when available). */
export function randomSeed(): number {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => void } };
  if (g.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    g.crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}
