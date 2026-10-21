/** Shared types for the two rendering phases. */

export type RendererMode = 'cpu' | 'gpu';

/** Runtime metrics surfaced by each renderer and shown in the HUD. */
export interface RenderStats {
  /** Frames per second measured by the renderer itself. */
  fps: number;
  /** Milliseconds spent preparing one frame (JS side). */
  frameMs: number;
  /** Number of drawn primitives: RN `<Text>` nodes (CPU) or Skia glyphs (GPU). */
  primitives: number;
  /** Free-form note describing *where* the measured work happens. */
  note: string;
}

export const EMPTY_STATS: RenderStats = { fps: 0, frameMs: 0, primitives: 0, note: '' };
