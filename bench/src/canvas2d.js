/**
 * Benchmark renderer A — Canvas 2D.
 *
 * Mirrors the app's PHASE 1 philosophy: the frame is assembled glyph by glyph in
 * JavaScript and rasterised by the CPU. `buildCells` is the *same* function the React
 * Native CPU renderer uses.
 */
import { buildCells } from '../../src/features/matrix-rain/core/simulation';

export function createCanvas2DRenderer({ canvas, state, glow }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let lastFont = '';
  let lastFill = '';

  return {
    id: 'canvas2d',
    label: 'Canvas 2D (CPU)',
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.textBaseline = 'top';
    },
    /** Draws one frame and returns the milliseconds spent on the CPU. */
    frame(elapsedSeconds, speedScale) {
      const started = performance.now();
      const { width, height } = canvas;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      const cells = buildCells(state, elapsedSeconds, speedScale);
      if (glow) ctx.shadowBlur = 6;

      lastFont = '';
      lastFill = '';
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const font = `${cell.italic ? 'italic ' : ''}${cell.fontWeight} ${cell.fontSize}px ${cell.fontFamily}`;
        // Avoid re-parsing the font when it did not change (cells are column-ordered).
        if (font !== lastFont) {
          ctx.font = font;
          lastFont = font;
        }
        if (cell.color !== lastFill) {
          ctx.fillStyle = cell.color;
          if (glow) ctx.shadowColor = cell.color;
          lastFill = cell.color;
        }
        ctx.fillText(cell.text, cell.x, cell.y);
      }
      if (glow) ctx.shadowBlur = 0;

      return performance.now() - started;
    },
    glyphCount() {
      return buildCells(state, 0, 1).length;
    },
  };
}
