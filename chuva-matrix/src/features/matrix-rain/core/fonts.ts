/**
 * Random font generation.
 *
 * Constraint #3 forbids a fixed font. React Native cannot enumerate system fonts on
 * every platform, so we ship a curated per-platform list of families that are known to
 * exist, and randomize the *selection* plus size, weight and slant. On the GPU path we
 * can do better: Skia exposes `listFontFamilies()`, so we enumerate the real fonts of the
 * device and sample from them (see `MatrixRainGpu`). The result is that no two runs use
 * the same combination.
 */
import { pick, randRange } from './rng';

export type FontWeight = '400' | '500' | '600' | '700' | '900';

export interface FontSpec {
  readonly family: string;
  /** Absolute font size in points. */
  readonly size: number;
  readonly weight: FontWeight;
  readonly italic: boolean;
}

const WEIGHTS: readonly FontWeight[] = ['400', '400', '500', '700', '900'];

const IOS_FAMILIES = [
  'Menlo',
  'Courier New',
  'Courier',
  'Avenir Next',
  'Futura',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'American Typewriter',
] as const;

const ANDROID_FAMILIES = [
  'monospace',
  'serif',
  'sans-serif',
  'sans-serif-condensed',
  'sans-serif-light',
  'sans-serif-medium',
  'sans-serif-thin',
  'casual',
  'cursive',
  'serif-monospace',
] as const;

const WEB_FAMILIES = [
  'ui-monospace',
  'monospace',
  'serif',
  'sans-serif',
  'Georgia',
  'Courier New',
  'Impact',
] as const;

export function curatedFamilies(platform: 'ios' | 'android' | 'web'): readonly string[] {
  if (platform === 'ios') return IOS_FAMILIES;
  if (platform === 'android') return ANDROID_FAMILIES;
  return WEB_FAMILIES;
}

/** Picks a random font specification from a candidate family list. */
export function randomFontSpec(
  next: () => number,
  families: readonly string[],
  baseSize: number,
  sizeJitter = 0.25
): FontSpec {
  const size = randRange(next, baseSize * (1 - sizeJitter), baseSize * (1 + sizeJitter));
  return {
    family: pick(next, families),
    size: Math.max(6, Math.round(size)),
    weight: pick(next, WEIGHTS),
    italic: next() < 0.18,
  };
}
