/**
 * Benchmark harness.
 *
 * Runs the *same* simulation core used by the mobile app through two renderers and
 * measures the sustained frame rate of each. Everything is exposed on `window.__bench`
 * so a headless browser (Playwright) can drive it without a UI.
 */
import { curatedFamilies } from '../../src/features/matrix-rain/core/fonts';
import { mulberry32, randomSeed } from '../../src/features/matrix-rain/core/rng';
import { createRainState } from '../../src/features/matrix-rain/core/simulation';
import { createCanvas2DRenderer } from './canvas2d';
import { createWebGLRenderer } from './webgl';

const cpuCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('cpu'));
const gpuCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('gpu'));
const statusEl = document.getElementById('status');
const gpuNameEl = document.getElementById('gpu-name');

const BASE_CONFIG = {
  speedScale: 1,
  trailMin: 6,
  trailMax: 24,
  charRate: 12,
  glow: false,
  randomizeFont: true,
  platform: 'web',
};

let sampleFamilies = () => curatedFamilies('web');

function sampleFontFamilies(seed) {
  const next = mulberry32(seed);
  const pool = curatedFamilies('web').slice();
  const out = [];
  while (out.length < Math.min(5, pool.length)) {
    out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
  }
  return out;
}

function makeState({ width, height, glyphSize, seed, glow }) {
  const families = sampleFontFamilies(seed);
  return createRainState(
    { ...BASE_CONFIG, seed, glyphSize, glow },
    width,
    height,
    families
  );
}

let current = null;

/** (Re)builds a session and instantiates both renderers for the given parameters. */
function setup({ width = 900, height = 600, glyphSize = 18, seed = randomSeed(), glow = false, scale = 1 }) {
  const state = makeState({ width, height, glyphSize, seed, glow });

  cpuCanvas.width = width * scale;
  cpuCanvas.height = height * scale;
  cpuCanvas.style.width = `${width}px`;
  cpuCanvas.style.height = `${height}px`;
  gpuCanvas.width = width * scale;
  gpuCanvas.height = height * scale;
  gpuCanvas.style.width = `${width}px`;
  gpuCanvas.style.height = `${height}px`;

  const cpu = createCanvas2DRenderer({ canvas: cpuCanvas, state, glow });
  const gpu = createWebGLRenderer({
    canvas: gpuCanvas,
    state,
    glow,
    onGpuUsed: (name) => {
      if (gpuNameEl) gpuNameEl.textContent = name;
    },
  });

  // Renderers work in CSS pixels; the GL viewport must match the backing store.
  cpu.resize(width, height);
  gpu.resize(gpuCanvas.width, gpuCanvas.height);

  current = { state, cpu, gpu, width, height, glyphSize, glow, seed };
  const glyphs = cpu.glyphCount();
  // Apples-to-apples primitive count: the number of glyph slots each renderer manages.
  const slots = state.columns.reduce((sum, c) => sum + c.trail, 0);
  if (statusEl) {
    statusEl.textContent = `${state.grid.columns} columns · ${state.grid.rows} rows · ${slots} slots · ${state.fontCount} fonts · palette ${state.palette.mode}`;
  }
  return { glyphs, slots, columns: state.grid.columns, rows: state.grid.rows, palette: state.palette.mode };
}

/** Runs one renderer for `seconds` and returns the measured statistics. */
function run({ renderer = 'cpu', seconds = 6, speedScale = 1 } = {}) {
  if (!current) setup({});
  const target = renderer === 'gpu' ? current.gpu : current.cpu;
  const show = renderer === 'gpu' ? gpuCanvas : cpuCanvas;
  const hide = renderer === 'gpu' ? cpuCanvas : gpuCanvas;
  show.style.opacity = '1';
  hide.style.opacity = '0.15';

  return new Promise((resolve) => {
    let frames = 0;
    let cpuMsTotal = 0;
    let cpuMsMax = 0;
    let longFrames = 0;
    const start = performance.now();
    let lastFrame = start;
    let elapsed = 0;

    const tick = (now) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000) || 0;
      lastFrame = now;
      elapsed += dt;

      const cpuMs = target.frame(elapsed, speedScale);
      cpuMsTotal += cpuMs;
      cpuMsMax = Math.max(cpuMsMax, cpuMs);
      frames++;
      if (cpuMs > 16.7) longFrames++;

      if (now - start >= seconds * 1000) {
        const span = now - start;
        resolve({
          renderer,
          label: target.label,
          seconds: span / 1000,
          frames,
          fps: (frames * 1000) / span,
          cpuMsAvg: cpuMsTotal / frames,
          cpuMsMax,
          frameBudgetFrames: longFrames,
          glyphs: target.glyphCount(),
          drawCalls: target.drawCalls ? target.drawCalls() : undefined,
          glyphSize: current.glyphSize,
          glow: current.glow,
        });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let rafId = 0;

/** Starts an interactive (non-measured) preview of one renderer, or stops it. */
function preview({ renderer = 'cpu', speedScale = 1 } = {}) {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (renderer === 'none') return;
  if (!current) setup({});
  const target = renderer === 'gpu' ? current.gpu : current.cpu;
  let last = performance.now();
  let elapsed = 0;
  const tick = (now) => {
    elapsed += Math.min(0.05, (now - last) / 1000);
    last = now;
    target.frame(elapsed, speedScale);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

window.__bench = {
  setup,
  run,
  preview,
  state: () => current,
  gpuName: () => (gpuNameEl ? gpuNameEl.textContent : 'unknown'),
  canvasSize: () => ({ width: current ? current.width : 0, height: current ? current.height : 0 }),
};

// A small default session so the page is not blank when opened manually.
setup({});
preview({ renderer: 'cpu' });
