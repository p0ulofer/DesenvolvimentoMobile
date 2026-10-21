/**
 * PHASE 2 — GPU renderer (Skia).
 *
 * All glyphs are drawn by Skia (GPU backend: Metal / OpenGL ES) inside a single `<Canvas>`.
 * The animation is driven by Reanimated *worklets* on the UI thread through one shared
 * clock, and every Skia prop that changes over time receives a `SharedValue`
 * (`AnimatedProp<T> = T | { value: T }`). Consequence:
 *
 *   - the JS thread is **not** involved per frame (no `setState`, no React reconciliation);
 *   - the number of React components is fixed for the whole session;
 *   - the per-frame cost is the GPU filling glyphs, not the CPU laying out views.
 *
 * This is what makes the comparison with PHASE 1 meaningful.
 */
import { Canvas, Group, Skia, Text as SkiaText, matchFont, type SkFont } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { hslToHex } from '../core/colors';
import { colorAt } from '../core/simulation';
import { mulberry32 } from '../core/rng';
import type { ColumnState, RainState } from '../core/simulation';
import type { RenderStats } from '../types';

interface Props {
  state: RainState;
  speedScale: number;
  glow: boolean;
  paused: boolean;
  onStats?: (stats: RenderStats) => void;
  style?: StyleProp<ViewStyle>;
}

const STATS_WINDOW_MS = 500;
/** Glyph flicker pool per cell — small on purpose: it is sampled on the UI thread. */
const GLYPHS_PER_CELL = 8;

export function MatrixRainGpu({ state, speedScale, glow, paused, onStats, style }: Props) {
  // Clock + frame counter live on the UI thread. They are intentionally *not* React state:
  // mutating them must never trigger a React render.
  const elapsedMs = useSharedValue(0);
  const frameCount = useSharedValue(0);
  const pausedSV = useSharedValue(paused);
  const speedSV = useSharedValue(speedScale);

  // Reanimated's contract is to assign `.value` on shared values from React; those
  // mutations are the *point* of the bridge and deliberately do not trigger a render.
  pausedSV.value = paused;
  speedSV.value = speedScale;

  useFrameCallback((info) => {
    'worklet';
    if (pausedSV.value) return;
    elapsedMs.value += info.timeSincePreviousFrame ?? 16.6667;
    frameCount.value += 1;
  }, true);

  const primitives = useMemo(() => state.columns.reduce((sum, c) => sum + c.trail, 0), [state]);

  // Glow = a layer that composites its content together with a zero-offset drop shadow
  // (i.e. a bloom) directly on the GPU. No per-glyph JS work, no second draw pass.
  const glowLayer = useMemo(() => {
    if (!glow) return undefined;
    const paint = Skia.Paint();
    const color = hslToHex(state.palette.baseHue, state.palette.saturation, state.palette.headLightness);
    paint.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, 0, 5, 5, Skia.Color(color), null, null));
    return paint;
  }, [glow, state.palette]);

  // FPS is sampled from JS: we read the UI-thread counter and derive the frame rate.
  // This is deliberately the only per-500ms JS involvement in the whole GPU path.
  useStatsSampler(frameCount, paused, primitives, onStats);

  return (
    <View style={[styles.fill, style]} pointerEvents="none">
      <Canvas style={styles.fill} opaque={false}>
        <Group layer={glowLayer}>
          {state.columns.map((column) => (
            <GpuColumn
              key={column.index}
              column={column}
              state={state}
              elapsedMs={elapsedMs}
              speedSV={speedSV}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

/** Reads the UI-thread frame counter from JS every `STATS_WINDOW_MS` and reports FPS. */
function useStatsSampler(
  frameCount: SharedValue<number>,
  paused: boolean,
  primitives: number,
  onStats?: (stats: RenderStats) => void
) {
  return useEffect(() => {
    let lastCount = 0;
    let lastAt = Date.now();
    const id = setInterval(() => {      const now = Date.now();
      const count = frameCount.value;
      const span = now - lastAt;
      const fps = span > 0 ? ((count - lastCount) * 1000) / span : 0;
      lastCount = count;
      lastAt = now;
      onStats?.({
        fps: paused ? 0 : fps,
        frameMs: fps > 0 ? 1000 / fps : 0,
        primitives,
        note: paused ? 'paused' : 'UI thread worklets + one Skia GPU draw',
      });
    }, STATS_WINDOW_MS);
    return () => clearInterval(id);
  }, [frameCount, paused, primitives, onStats]);
}

interface ColumnProps {
  column: ColumnState;
  state: RainState;
  elapsedMs: SharedValue<number>;
  speedSV: SharedValue<number>;
}

function GpuColumn({ column, state, elapsedMs, speedSV }: ColumnProps) {
  const { grid, palette, glyphPool } = state;

  // One SkFont per column (fonts are randomly chosen per column at session start).
  const font: SkFont = useMemo(
    () =>
      matchFont({
        fontFamily: column.font.family,
        fontSize: column.font.size,
        fontWeight: column.font.weight,
        fontStyle: column.font.italic ? 'italic' : 'normal',
      }),
    [column]
  );

  // Trail colors are constant per slot, so they are plain strings (no SharedValue).
  const colors = useMemo(
    () =>
      Array.from({ length: column.trail }, (_, slot) =>
        colorAt(palette, column.hue, slot / Math.max(1, column.trail - 1))
      ),
    [column, palette]
  );

  const slots = useMemo(() => Array.from({ length: column.trail }, (_, i) => i), [column.trail]);

  return (
    <Group>
      {slots.map((slot) => (
        <GpuGlyph
          key={slot}
          column={column}
          slot={slot}
          cellHeight={grid.cellHeight}
          color={colors[slot]}
          font={font}
          glyphPool={glyphPool}
          elapsedMs={elapsedMs}
          speedSV={speedSV}
        />
      ))}
    </Group>
  );
}

interface GlyphProps {
  column: ColumnState;
  slot: number;
  cellHeight: number;
  color: string;
  font: SkFont;
  glyphPool: readonly string[];
  elapsedMs: SharedValue<number>;
  speedSV: SharedValue<number>;
}

function GpuGlyph({ column, slot, cellHeight, color, font, glyphPool, elapsedMs, speedSV }: GlyphProps) {
  // Random flicker pool for this specific cell (seeded by column + slot).
  const glyphs = useMemo(() => {
    const next = mulberry32(((column.seed ^ (slot * 2654435761)) >>> 0) || 1);
    return Array.from({ length: GLYPHS_PER_CELL }, () => glyphPool[Math.floor(next() * glyphPool.length)]);
  }, [column.seed, slot, glyphPool]);

  // `y` follows the column head. Pure arithmetic — self-contained worklet.
  const y = useDerivedValue(() => {
    'worklet';
    const s = column.phase + column.speed * (elapsedMs.value / 1000) * speedSV.value;
    const cycles = Math.floor(s / column.cycle);
    const pos = s - cycles * column.cycle;
    const head = pos - column.trail;
    return (head - slot) * cellHeight;
  }, [column, cellHeight, slot]);

  // The glyph changes over time: this is the "rain" shimmer, all on the UI thread.
  const text = useDerivedValue(() => {
    'worklet';
    const tick = Math.floor(elapsedMs.value / column.charIntervalMs + slot * 0.37);
    return glyphs[tick % glyphs.length];
  }, [column.charIntervalMs, glyphs, slot]);

  return <SkiaText x={column.x} y={y} text={text} font={font} color={color} />;
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});
