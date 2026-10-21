/**
 * Random color generation.
 *
 * Constraint #3 forbids a fixed palette. We therefore generate a fresh palette on every
 * session from a random seed: a random "mood" (which biases the hue family) plus random
 * saturation/lightness, and — per column — a random hue offset, font-independent.
 *
 * The classic Matrix green is kept as *one possible* mood (with probability ~45%) to
 * respect the source material, but it is never guaranteed.
 */
import { randRange } from './rng';

export interface Palette {
  /** Human readable id, shown in the UI so the randomness is visible. */
  readonly mode: string;
  /** Column hue = baseHue + jitter (degrees). */
  readonly baseHue: number;
  readonly hueJitter: number;
  /** 0..1 */
  readonly saturation: number;
  readonly lightness: number;
  /** 0..1 — lightness of the leading (head) glyph. */
  readonly headLightness: number;
  /** When true, every column gets a completely independent random hue. */
  readonly perColumnHue: boolean;
}

interface Mood {
  readonly mode: string;
  readonly hue: [number, number];
  readonly sat: [number, number];
  readonly light: [number, number];
}

const MOODS: readonly Mood[] = [
  { mode: 'phosphor-green', hue: [96, 152], sat: [0.75, 1.0], light: [0.34, 0.52] },
  { mode: 'amber-terminal', hue: [28, 48], sat: [0.8, 1.0], light: [0.4, 0.56] },
  { mode: 'ice-cyan', hue: [172, 200], sat: [0.7, 1.0], light: [0.42, 0.58] },
  { mode: 'ultraviolet', hue: [262, 300], sat: [0.6, 0.95], light: [0.42, 0.6] },
  { mode: 'blood-red', hue: [345, 366], sat: [0.7, 1.0], light: [0.38, 0.54] },
  { mode: 'acid-lime', hue: [62, 92], sat: [0.75, 1.0], light: [0.4, 0.56] },
];

/** Clamps a value into [min, max]. */
function clamp(v: number, min: number, max: number): number {
  'worklet';
  return v < min ? min : v > max ? max : v;
}

/** Converts HSL (h in degrees, s/l in [0,1]) to a `#rrggbb` string. Worklet-safe. */
export function hslToHex(h: number, s: number, l: number): string {
  'worklet';
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = c; g = x;
  } else if (hh < 120) {
    r = x; g = c;
  } else if (hh < 180) {
    g = c; b = x;
  } else if (hh < 240) {
    g = x; b = c;
  } else if (hh < 300) {
    r = x; b = c;
  } else {
    r = c; b = x;
  }
  const toByte = (v: number) => {
    'worklet';
    const n = Math.round((v + m) * 255);
    return (n < 0 ? 0 : n > 255 ? 255 : n).toString(16).padStart(2, '0');
  };
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/** Creates a fresh random palette. ~45% of the time it lands on a green mood. */
export function createPalette(next: () => number): Palette {
  const greenish = next() < 0.45;
  const pool = greenish
    ? MOODS.filter((m) => m.mode === 'phosphor-green' || m.mode === 'acid-lime')
    : MOODS;
  const mood = pool[Math.min(pool.length - 1, Math.floor(next() * pool.length))];
  const perColumnHue = !greenish && next() < 0.5;
  return {
    mode: mood.mode,
    baseHue: randRange(next, mood.hue[0], mood.hue[1]),
    hueJitter: randRange(next, 6, 34),
    saturation: randRange(next, mood.sat[0], mood.sat[1]),
    lightness: randRange(next, mood.light[0], mood.light[1]),
    headLightness: randRange(next, 0.88, 0.99),
    perColumnHue,
  };
}

/** Returns the hue for one column, honoring `perColumnHue`. */
export function columnHue(next: () => number, palette: Palette): number {
  if (palette.perColumnHue) {
    return next() * 360;
  }
  return palette.baseHue + (next() - 0.5) * 2 * palette.hueJitter;
}

/**
 * Color of a glyph at `t` in [0,1], where 0 = the leading (head) glyph and
 * 1 = the very tail of the trail. Fades the lightness towards the background.
 */
export function trailColor(palette: Palette, hue: number, t: number): string {
  'worklet';
  if (t <= 0.0001) {
    return hslToHex(hue, Math.min(0.4, palette.saturation * 0.4), palette.headLightness);
  }
  const fade = Math.pow(1 - clamp(t, 0, 1), 1.35);
  const lightness = clamp(0.08 + palette.lightness * fade, 0.05, 0.97);
  return hslToHex(hue, palette.saturation, lightness);
}
