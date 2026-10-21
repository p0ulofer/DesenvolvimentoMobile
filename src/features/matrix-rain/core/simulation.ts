/**
 * Framework-agnostic rain simulation.
 *
 * The simulation is intentionally tiny (O(columns) per frame). The expensive part of the
 * "Matrix Rain" is *drawing* thousands of glyphs, which is exactly what the two phases
 * (CPU view tree vs GPU/Skia) differ on. Keeping the model pure means the CPU renderer,
 * the GPU renderer and the web benchmark all share the same storm.
 */
import { columnHue, createPalette, hslToHex, trailColor, type Palette } from './colors';
import { createGlyphPool, pickGlyph } from './glyphs';
import { curatedFamilies, randomFontSpec, type FontSpec, type FontWeight } from './fonts';
import { hash3, mulberry32, randRange, randomSeed } from './rng';

export interface RainConfig {
  /** Seed for this session. Change it to "Reshuffle" the whole storm. */
  seed: number;
  /** Cell size in points, derived from `glyphSize`. */
  glyphSize: number;
  /** Multiplier applied to every column speed. */
  speedScale: number;
  trailMin: number;
  trailMax: number;
  /** Glyph flicker rate (changes per second), randomized per column around this value. */
  charRate: number;
  /** Draw a glow behind each glyph. Expensive on the CPU path, cheap on the GPU path. */
  glow: boolean;
  /** Randomize size/weight/slant per column on top of the family. */
  randomizeFont: boolean;
  platform: 'ios' | 'android' | 'web';
  /** Optional override of the glyph pool (used by the web benchmark). */
  glyphPoolSize?: number;
}

export interface ColumnState {
  readonly index: number;
  /** Left edge of the column in px. */
  readonly x: number;
  /** Rows per second, before `speedScale`. */
  readonly speed: number;
  /** Trail length in rows. */
  readonly trail: number;
  /** Initial offset into the cycle, in rows. */
  readonly phase: number;
  /** Total cycle length in rows (screen height + trail + 1). */
  readonly cycle: number;
  readonly hue: number;
  readonly seed: number;
  readonly charIntervalMs: number;
  readonly font: FontSpec;
}

export interface Cell {
  /** Stable React key: `c{column}-{slot}`. */
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: FontWeight;
  readonly italic: boolean;
}

export interface Grid {
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columns: number;
}

export interface RainState {
  readonly config: RainConfig;
  readonly palette: Palette;
  readonly glyphPool: readonly string[];
  readonly families: readonly string[];
  readonly grid: Grid;
  readonly columns: readonly ColumnState[];
  /** Fonts available for the current configuration (exposed for the UI/debug panel). */
  readonly fontCount: number;
}

/** Derives the grid (rows/columns/cell size) from a viewport and a base glyph size. */
export function computeGrid(width: number, height: number, glyphSize: number): Grid {
  const cellWidth = Math.max(8, Math.round(glyphSize * 0.78));
  const cellHeight = Math.max(10, Math.round(glyphSize * 1.16));
  const columns = Math.max(1, Math.floor(width / cellWidth));
  const rows = Math.max(1, Math.ceil(height / cellHeight));
  return { rows, cellWidth, cellHeight, columns };
}

/**
 * Builds a full rain state for a viewport. Deterministic: the same `config` + viewport
 * always yields the same storm.
 */
export function createRainState(
  config: RainConfig,
  width: number,
  height: number,
  familyOverride?: readonly string[]
): RainState {
  const next = mulberry32(config.seed);
  const palette = createPalette(next);
  const glyphPool = createGlyphPool(next, config.glyphPoolSize ?? 96);
  const families = familyOverride ?? curatedFamilies(config.platform);
  const grid = computeGrid(width, height, config.glyphSize);
  const columnWidth = width / grid.columns;

  const columns: ColumnState[] = [];
  for (let index = 0; index < grid.columns; index++) {
    const trail = Math.round(randRange(next, config.trailMin, config.trailMax));
    const speed = randRange(next, 2.5, 16);
    const font = config.randomizeFont
      ? randomFontSpec(next, families, config.glyphSize, 0.3)
      : { ...randomFontSpec(next, families, config.glyphSize, 0), size: config.glyphSize };
    const cycle = grid.rows + trail + 1;
    columns.push({
      index,
      x: index * columnWidth + columnWidth * randRange(next, 0.1, 0.35),
      speed,
      trail,
      phase: randRange(next, -cycle, 0),
      cycle,
      hue: columnHue(next, palette),
      seed: Math.floor(next() * 0xffffffff),
      charIntervalMs: 1000 / randRange(next, config.charRate * 0.5, config.charRate * 1.6),
      font,
    });
  }

  return {
    config,
    palette,
    glyphPool,
    families,
    grid,
    columns,
    fontCount: families.length,
  };
}

/** Fresh config + state, used on first mount and by the "Reshuffle" button. */
export function reshuffle(config: RainConfig, width: number, height: number, families?: readonly string[]) {
  return createRainState({ ...config, seed: randomSeed() }, width, height, families);
}

/** Position of the head glyph of a column, in rows (fractional). */
export function headRow(column: ColumnState, elapsedSeconds: number, speedScale: number): number {
  const s = column.phase + column.speed * elapsedSeconds * speedScale;
  const cycles = Math.floor(s / column.cycle);
  const pos = s - cycles * column.cycle;
  return pos - column.trail;
}

/**
 * Builds the visible cells of a frame. Pure; called once per rendered frame by the CPU
 * renderer and by the web benchmark.
 */
export function buildCells(
  state: RainState,
  elapsedSeconds: number,
  speedScale: number
): Cell[] {
  const { grid, columns, glyphPool, palette } = state;
  const tick = Math.floor(elapsedSeconds * state.config.charRate);
  const cells: Cell[] = [];
  for (let c = 0; c < columns.length; c++) {
    const column = columns[c];
    const head = headRow(column, elapsedSeconds, speedScale);
    for (let slot = 0; slot < column.trail; slot++) {
      const row = Math.floor(head) - slot;
      if (row < 0 || row >= grid.rows) continue;
      const t = slot / column.trail;
      cells.push({
        key: `c${column.index}-${slot}`,
        x: column.x,
        y: row * grid.cellHeight,
        text: pickGlyph(glyphPool, column.seed, row, tick),
        color: glowColor(palette, column.hue, t),
        fontFamily: column.font.family,
        fontSize: column.font.size,
        fontWeight: column.font.weight,
        italic: column.font.italic,
      });
    }
  }
  return cells;
}

/** Same as `trailColor` but kept here so the fade curve is explicit next to `buildCells`. */
function glowColor(palette: Palette, hue: number, t: number): string {
  return trailColor(palette, hue, t);
}

/** Solid color used for a glyph at trail position `t` (exported for the GPU renderer). */
export function colorAt(palette: Palette, hue: number, t: number): string {
  return trailColor(palette, hue, t);
}

/** Head (leading) glyph color. */
export function headColor(palette: Palette, hue: number): string {
  return hslToHex(hue, Math.min(0.4, palette.saturation * 0.4), palette.headLightness);
}

export { hash3 };
