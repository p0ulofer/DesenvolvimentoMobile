/**
 * Random glyph generation.
 *
 * Constraint #3 of the activity forbids a *fixed* character set. Instead of hardcoding
 * "the katakana alphabet", we sample random Unicode code points from a set of
 * known-printable BMP blocks. Because the block and the code point are drawn from a
 * session seed, the glyph pool is different on every run — there is no fixed charset.
 *
 * Katakana is included (it is the canonical "Matrix" look) but it is only one of ~20
 * blocks, and even inside a block the individual glyphs are random.
 */

/** A half-open-ish inclusive range of BMP code points known to be printable. */
export interface GlyphRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Blocks we are willing to sample from. Curated so we avoid control characters,
 * combining marks and unassigned planes (which would render as "tofu").
 */
export const GLYPH_RANGES: readonly GlyphRange[] = [
  { start: 0x0021, end: 0x007e }, // ASCII printable (no space)
  { start: 0x00a1, end: 0x00ff }, // Latin-1 supplement
  { start: 0x0100, end: 0x017f }, // Latin extended-A
  { start: 0x0180, end: 0x024f }, // Latin extended-B
  { start: 0x0370, end: 0x03ff }, // Greek
  { start: 0x0400, end: 0x04ff }, // Cyrillic
  { start: 0x05d0, end: 0x05ea }, // Hebrew letters
  { start: 0x0620, end: 0x064a }, // Arabic letters
  { start: 0x0904, end: 0x0939 }, // Devanagari
  { start: 0x0e01, end: 0x0e3a }, // Thai
  { start: 0x1e00, end: 0x1eff }, // Latin extended additional
  { start: 0x2190, end: 0x21ff }, // Arrows
  { start: 0x2200, end: 0x22ff }, // Mathematical operators
  { start: 0x2500, end: 0x257f }, // Box drawing
  { start: 0x2591, end: 0x259f }, // Block elements
  { start: 0x25a0, end: 0x25ff }, // Geometric shapes
  { start: 0x2600, end: 0x26ff }, // Miscellaneous symbols
  { start: 0x2700, end: 0x27bf }, // Dingbats
  { start: 0x3040, end: 0x3096 }, // Hiragana
  { start: 0x30a0, end: 0x30ff }, // Katakana (the classic Matrix look)
  { start: 0x31f0, end: 0x31ff }, // Katakana phonetic extensions
  { start: 0x4e00, end: 0x4e7f }, // A small window into CJK unified ideographs
  { start: 0xac00, end: 0xac7f }, // A small window into Hangul syllables
];

/**
 * Builds a glyph pool of `size` distinct characters, each drawn from a random block
 * and a random code point inside it.
 */
export function createGlyphPool(next: () => number, size = 96): string[] {
  const pool = new Set<string>();
  let guard = 0;
  while (pool.size < size && guard < size * 40) {
    guard++;
    const range = GLYPH_RANGES[Math.floor(next() * GLYPH_RANGES.length)];
    const span = range.end - range.start + 1;
    const code = range.start + Math.floor(next() * span);
    if (code === 0x20) continue;
    pool.add(String.fromCharCode(code));
  }
  // Guarantee a non-empty pool even if the guard trips.
  if (pool.size === 0) {
    pool.add('0');
  }
  return Array.from(pool);
}

/**
 * Chooses the glyph for a cell. Deterministic given (seed, row, tick) so the CPU and
 * GPU renderers produce the same storm for the same configuration.
 *
 * Plain function (not a worklet) — the GPU renderer uses an equivalent inlined helper.
 */
export function pickGlyph(pool: readonly string[], seed: number, row: number, tick: number): string {
  const h = hash3Local(seed, row, tick);
  return pool[h % pool.length];
}

/** Same math as `rng.hash3`, duplicated locally to keep this module dependency-free. */
function hash3Local(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
