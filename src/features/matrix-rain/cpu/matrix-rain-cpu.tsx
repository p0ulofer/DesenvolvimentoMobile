/**
 * PHASE 1 — CPU renderer.
 *
 * Every glyph is a native React Native `<Text>` view. Once per `requestAnimationFrame`
 * the whole frame is computed in JavaScript and pushed through React state, so the JS
 * thread has to:
 *   1. rebuild the list of visible cells (allocation + glyph selection),
 *   2. reconcile hundreds of React elements against the previous frame,
 *   3. hand the new props to the native view tree (layout + text rasterisation).
 *
 * Steps 2 and 3 are the bottleneck this phase is meant to expose: the work grows with the
 * number of *views*, and it all happens on the CPU.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { buildCells, type Cell, type RainState } from '../core/simulation';
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

export function MatrixRainCpu({ state, speedScale, glow, paused, onStats, style }: Props) {
  const [cells, setCells] = useState<Cell[]>([]);

  const elapsedRef = useRef(0);
  const lastTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const cellCountRef = useRef(0);
  const windowRef = useRef({ frames: 0, workMs: 0, startedAt: 0 });

  useEffect(() => {
    if (paused) {
      onStats?.({
        fps: 0,
        frameMs: 0,
        primitives: cellCountRef.current,
        note: 'paused',
      });
      return;
    }

    const loop = (ts: number) => {
      const last = lastTsRef.current || ts;
      // Clamp dt so a stalled frame does not teleport the rain.
      const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
      lastTsRef.current = ts;
      elapsedRef.current += dt;

      const workStart = now();
      const next = buildCells(state, elapsedRef.current, speedScale);
      setCells(next);
      const workMs = now() - workStart;
      cellCountRef.current = next.length;

      const w = windowRef.current;
      if (w.startedAt === 0) w.startedAt = ts;
      w.frames += 1;
      w.workMs += workMs;
      const span = ts - w.startedAt;
      if (span >= STATS_WINDOW_MS) {
        onStats?.({
          fps: (w.frames * 1000) / span,
          frameMs: w.workMs / w.frames,
          primitives: next.length,
          note: 'JS thread + React reconciliation + native text views',
        });
        windowRef.current = { frames: 0, workMs: 0, startedAt: ts };
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = 0;
    };
  }, [state, speedScale, paused, onStats]);

  const glyphShadow = useMemo(
    () =>
      glow
        ? { textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 7 }
        : null,
    [glow]
  );

  return (
    <View style={[styles.fill, style]} pointerEvents="none">
      {cells.map((cell) => (
        <Text
          key={cell.key}
          style={[
            styles.glyph,
            {
              left: cell.x,
              top: cell.y,
              color: cell.color,
              fontFamily: cell.fontFamily,
              fontSize: cell.fontSize,
              fontWeight: cell.fontWeight,
              fontStyle: cell.italic ? 'italic' : 'normal',
            },
            glyphShadow,
            glow ? { textShadowColor: cell.color } : null,
          ]}>
          {cell.text}
        </Text>
      ))}
    </View>
  );
}

/** Monotonic-ish clock that works on Hermes and in the browser. */
function now(): number {
  const g = globalThis as { performance?: { now?: () => number } };
  if (g.performance?.now) return g.performance.now();
  return Date.now();
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
  glyph: {
    position: 'absolute',
    includeFontPadding: false,
  },
});
