/**
 * Resolves the list of font families used to randomize glyph fonts.
 *
 * - On native we can ask Skia for the *real* families installed on the device
 *   (`listFontFamilies()`), then sample a random subset of them.
 * - On web / if Skia is unavailable we fall back to a curated per-platform list.
 *
 * Sampling happens once per mount; combined with the seeded per-column font choice this
 * means the font mix differs on every run.
 */
import { useState } from 'react';
import { Platform } from 'react-native';
import { listFontFamilies } from '@shopify/react-native-skia';

import { curatedFamilies } from './core/fonts';
import { mulberry32, randomSeed } from './core/rng';

const SAMPLE_SIZE = 18;
const UNSAFE = /emoji|color|symbol|noto sans (arabic|hebrew|thai|devanagari)/i;

export function useRainFamilies(): readonly string[] {
  const [families] = useState<readonly string[]>(() => resolveFamilies());
  return families;
}

function resolveFamilies(): readonly string[] {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  const fallback = curatedFamilies(platform);
  try {
    const all = listFontFamilies().filter((f) => !!f && f.length <= 40 && !UNSAFE.test(f));
    if (all.length < 4) return fallback;
    // Random sample without replacement, seeded so it is stable for the session.
    const next = mulberry32(randomSeed());
    const pool = all.slice();
    const sampled: string[] = [];
    while (sampled.length < Math.min(SAMPLE_SIZE, pool.length)) {
      const i = Math.floor(next() * pool.length);
      sampled.push(pool.splice(i, 1)[0]);
    }
    return sampled;
  } catch {
    return fallback;
  }
}
