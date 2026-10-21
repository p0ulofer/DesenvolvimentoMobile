import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What this is',
    body: 'A "Matrix Rain" character-rain effect built twice: once with pure CPU-side rendering (React Native views, driven from the JS thread) and once with GPU rendering (Skia, animated on the UI thread). Both read the same simulation, so you can switch between them and compare frame rate, frame time and glyph count for the same storm.',
  },
  {
    title: 'Phase 1 — CPU',
    body: 'Every glyph is a native <Text> view. Each frame the whole visible grid is recomputed in JavaScript and pushed through React state. The cost is proportional to the number of views: JS work + React reconciliation + native layout and text rasterisation. Add glow or drop the cell size and the frame rate collapses — that is the point of the baseline.',
  },
  {
    title: 'Phase 2 — GPU',
    body: 'Skia (Metal on iOS, OpenGL ES on Android) draws all glyphs in a single canvas. The animation runs in Reanimated worklets on the UI thread, and Skia props receive shared values, so there is no React re-render per frame. The frame rate stays flat as the glyph count grows; the remaining cost is GPU fill rate.',
  },
  {
    title: 'Randomness',
    body: 'Characters are sampled from random Unicode code points (never a fixed charset), colors come from a palette whose mood, hue, saturation and lightness are drawn per session, every column gets its own randomly chosen system font plus random size/weight/slant, and speeds, trail lengths and phases are all random. Tap Shuffle to draw a completely new storm.',
  },
  {
    title: 'Reproducibility',
    body: 'Randomness is generated from a seeded PRNG. The seed is shown in the HUD; the same seed and configuration always reproduce the same storm, which is what makes the CPU vs GPU comparison fair.',
  },
];

export default function AboutScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: (Platform.OS === 'web' ? Spacing.six : insets.top) + Spacing.four,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}>
      <ThemedView style={styles.inner}>
        <ThemedText type="title">Matrix Rain</ThemedText>
        <ThemedText themeColor="textSecondary">
          CPU vs GPU rendering — implementation notes
        </ThemedText>

        {SECTIONS.map((section) => (
          <ThemedView key={section.title} style={styles.section}>
            <ThemedText type="subtitle">{section.title}</ThemedText>
            <ThemedText type="small">{section.body}</ThemedText>
          </ThemedView>
        ))}

        <ThemedText type="small" themeColor="textSecondary">
          The full development log (prompts, decisions, problems and fixes) lives in
          BUILD_LOG.md at the repository root.
        </ThemedText>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { alignItems: 'center', paddingHorizontal: Spacing.four },
  inner: { maxWidth: MaxContentWidth, width: '100%', gap: Spacing.four },
  section: { gap: Spacing.two },
});
