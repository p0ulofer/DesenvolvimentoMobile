/**
 * Matrix Rain screen: hosts both phases and lets you compare them live.
 *
 * The same `RainConfig` (seed, palette, glyph pool, fonts, speeds) feeds either renderer,
 * so switching CPU <-> GPU shows the same storm rendered two different ways.
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { setZenMode, useZenMode } from '@/hooks/use-zen-mode';

import { createRainState, type RainConfig } from './core/simulation';
import { randomSeed } from './core/rng';
import { MatrixRainCpu } from './cpu/matrix-rain-cpu';
import { MatrixRainGpu } from './gpu/matrix-rain-gpu';
import { useRainFamilies } from './use-rain-families';
import { EMPTY_STATS, type RendererMode, type RenderStats } from './types';

const Cpu = memo(MatrixRainCpu);
const Gpu = memo(MatrixRainGpu);

function platformId(): RainConfig['platform'] {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

function makeConfig(seed: number): RainConfig {
  return {
    seed,
    glyphSize: 18,
    speedScale: 1,
    trailMin: 6,
    trailMax: 24,
    charRate: 12,
    glow: true,
    randomizeFont: true,
    platform: platformId(),
  };
}

export default function MatrixRainScreen() {
  const insets = useSafeAreaInsets();
  const families = useRainFamilies();
  // "Rain only" mode: hides the HUD, the control panel and the native tab bar.
  const zen = useZenMode();

  const [mode, setMode] = useState<RendererMode>('cpu');
  const [config, setConfig] = useState<RainConfig>(() => makeConfig(randomSeed()));
  const [paused, setPaused] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [stats, setStats] = useState<RenderStats>(EMPTY_STATS);

  const state = useMemo(
    () => createRainState(config, size.width, size.height, families),
    [config, size.width, size.height, families]
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const reshuffle = useCallback(() => setConfig(makeConfig(randomSeed())), []);
  const patch = useCallback(
    (delta: Partial<RainConfig>) => setConfig((prev) => ({ ...prev, ...delta })),
    []
  );

  const ready = size.width > 0 && size.height > 0;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {ready &&
        (mode === 'cpu' ? (
          <Cpu
            key={`cpu-${config.seed}`}
            state={state}
            speedScale={config.speedScale}
            glow={config.glow}
            paused={paused}
            onStats={setStats}
            style={styles.fill}
          />
        ) : (
          <Gpu
            key={`gpu-${config.seed}`}
            state={state}
            speedScale={config.speedScale}
            glow={config.glow}
            paused={paused}
            onStats={setStats}
            style={styles.fill}
          />
        ))}

      <View
        style={[styles.hud, { top: insets.top + Spacing.two }, zen && styles.overlayHidden]}
        pointerEvents="box-none">
        <View style={styles.hudRow}>
          <Chip label={mode === 'cpu' ? 'CPU' : 'GPU'} accent />
          <Chip label={`${stats.fps.toFixed(0)} fps`} />
          <Chip label={`${stats.frameMs.toFixed(1)} ms`} />
          <Chip label={`${stats.primitives} glyphs`} />
        </View>
        <View style={styles.hudRow}>
          <Chip label={state.palette.mode} />
          <Chip label={`${state.grid.columns} cols`} />
          <Chip label={`${state.fontCount} fonts`} />
          <Chip label={`seed ${config.seed.toString(16).slice(0, 6)}`} />
        </View>
        {!!stats.note && (
          <ThemedText type="small" style={styles.note} themeColor="textSecondary">
            {stats.note}
          </ThemedText>
        )}
      </View>

      <View
        style={[
          styles.panel,
          { paddingBottom: insets.bottom + Spacing.two },
          zen && styles.overlayHidden,
        ]}
        pointerEvents="box-none">
        <View style={styles.row}>
          <ToggleButton label="CPU" active={mode === 'cpu'} onPress={() => setMode('cpu')} />
          <ToggleButton label="GPU" active={mode === 'gpu'} onPress={() => setMode('gpu')} />
          <ToggleButton label={paused ? '▶ Play' : '❚❚ Pause'} active={paused} onPress={() => setPaused((p) => !p)} />
          <ToggleButton label="⟳ Shuffle" active={false} onPress={reshuffle} />
          <ToggleButton label="⛶ Rain only" active={false} onPress={() => setZenMode(true)} />
        </View>
        <View style={styles.row}>
          <Stepper
            label="speed"
            value={config.speedScale.toFixed(2)}
            onMinus={() => patch({ speedScale: Math.max(0.25, +(config.speedScale - 0.25).toFixed(2)) })}
            onPlus={() => patch({ speedScale: Math.min(4, +(config.speedScale + 0.25).toFixed(2)) })}
          />
          <Stepper
            label="size"
            value={`${config.glyphSize}`}
            onMinus={() => patch({ glyphSize: Math.max(10, config.glyphSize - 2) })}
            onPlus={() => patch({ glyphSize: Math.min(40, config.glyphSize + 2) })}
          />
          <Stepper
            label="trail"
            value={`${config.trailMax}`}
            onMinus={() => patch({ trailMax: Math.max(config.trailMin + 2, config.trailMax - 2) })}
            onPlus={() => patch({ trailMax: Math.min(48, config.trailMax + 2) })}
          />
          <ToggleButton
            label="glow"
            active={config.glow}
            onPress={() => patch({ glow: !config.glow })}
          />
        </View>
      </View>

      {zen && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show controls"
          onPress={() => setZenMode(false)}
          hitSlop={Spacing.three}
          style={[styles.restore, { bottom: insets.bottom + Spacing.three }]}>
          <ThemedText type="code" style={styles.restoreText}>
            ☰
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function Chip({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <View style={[styles.chip, accent && styles.chipAccent]}>
      <ThemedText type="code" style={styles.chipText}>
        {label}
      </ThemedText>
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active && styles.buttonActive,
        pressed && styles.pressed,
      ]}>
      <ThemedText type="code" style={[styles.buttonText, active && styles.buttonTextActive]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
        <ThemedText type="code" style={styles.buttonText}>
          −
        </ThemedText>
      </Pressable>
      <ThemedText type="code" style={styles.stepValue}>
        {label} {value}
      </ThemedText>
      <Pressable onPress={onPlus} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
        <ThemedText type="code" style={styles.buttonText}>
          +
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Zen mode keeps the overlays mounted (so nothing remounts) and just takes them out
  // of the layout.
  overlayHidden: { display: 'none' },
  restore: {
    position: 'absolute',
    right: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 255, 140, 0.4)',
    backgroundColor: 'rgba(0, 20, 0, 0.5)',
    opacity: 0.5,
  },
  restoreText: { color: '#8affbd', fontSize: 16 },
  hud: { position: 'absolute', left: Spacing.three, right: Spacing.three, gap: Spacing.one },
  hudRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  note: { opacity: 0.65 },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(0, 20, 0, 0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 255, 140, 0.35)',
  },
  chipAccent: { backgroundColor: 'rgba(0, 255, 140, 0.18)' },
  chipText: { color: '#7dffb0', fontSize: 11 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    backgroundColor: 'rgba(0, 10, 0, 0.72)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 255, 140, 0.35)',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 255, 140, 0.4)',
    backgroundColor: 'rgba(0, 255, 140, 0.06)',
  },
  buttonActive: { backgroundColor: 'rgba(0, 255, 140, 0.28)' },
  buttonText: { color: '#8affbd', fontSize: 12 },
  buttonTextActive: { color: '#eafff2' },
  pressed: { opacity: 0.6 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 255, 140, 0.4)',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
  },
  stepBtn: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  stepValue: { color: '#8affbd', fontSize: 11, minWidth: 64, textAlign: 'center' },
});
