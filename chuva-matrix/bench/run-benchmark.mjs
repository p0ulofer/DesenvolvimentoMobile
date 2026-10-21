/**
 * Headless benchmark runner.
 *
 *   node run-benchmark.mjs
 *
 * Builds the harness, serves it, drives it with headless Chromium and writes
 * `results/results.json` + `results/summary.md` + screenshots.
 *
 * IMPORTANT: this sandbox has no GPU, so Chromium falls back to SwiftShader (software
 * WebGL). The frame rates are therefore *not* representative of real hardware — but the
 * **CPU milliseconds per frame** are hardware-independent and that is the metric the
 * comparison is built on.
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, 'dist');
const resultsDir = resolve(here, 'results');
mkdirSync(resultsDir, { recursive: true });

console.log('› building harness…');
execFileSync('node', [resolve(here, 'build.mjs')], { stdio: 'inherit' });

// ---- tiny static server ---------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};
const server = createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const file = join(distDir, urlPath === '/' ? 'index.html' : urlPath);
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}/`;
console.log(`› serving ${distDir} at ${baseUrl}`);

// ---- browser ----------------------------------------------------------------------------
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 });
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[browser error]', msg.text());
});
page.on('pageerror', (err) => console.log('[page error]', err.message));

await page.goto(baseUrl, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__bench, null, { timeout: 15000 });

const gpuName = await page.evaluate(() => window.__bench.gpuName());
console.log('› WebGL renderer:', gpuName);

const WIDTH = 900;
const HEIGHT = 600;
const SEED = 0x5eed1234;
const SECONDS = Number(process.env.BENCH_SECONDS || 5);
const SIZES = [12, 16, 20, 26, 32];

const results = [];
for (const glyphSize of SIZES) {
  const meta = await page.evaluate(
    ([w, h, size, seed]) => window.__bench.setup({ width: w, height: h, glyphSize: size, seed, glow: false }),
    [WIDTH, HEIGHT, glyphSize, SEED]
  );
  for (const renderer of ['cpu', 'gpu']) {
    const stats = await page.evaluate(
      ([r, s]) => window.__bench.run({ renderer: r, seconds: s }),
      [renderer, SECONDS]
    );
    results.push({ ...stats, ...meta, viewport: `${WIDTH}x${HEIGHT}` });
    console.log(
      `  ${String(glyphSize).padStart(2)}px ${renderer.toUpperCase().padEnd(3)} ` +
        `${String(Math.round(stats.glyphs)).padStart(5)} glyphs  ` +
        `${stats.fps.toFixed(1).padStart(7)} fps  ` +
        `cpu ${stats.cpuMsAvg.toFixed(2)}ms/frame`
    );
  }
}

// ---- glow experiment (one size) ----------------------------------------------------------
for (const glow of [true]) {
  const meta = await page.evaluate(
    ([w, h, seed, g]) => window.__bench.setup({ width: w, height: h, glyphSize: 18, seed, glow: g }),
    [WIDTH, HEIGHT, SEED, glow]
  );
  for (const renderer of ['cpu', 'gpu']) {
    const stats = await page.evaluate(
      ([r, s]) => window.__bench.run({ renderer: r, seconds: s }),
      [renderer, SECONDS]
    );
    results.push({ ...stats, ...meta, viewport: `${WIDTH}x${HEIGHT}`, experiment: 'glow' });
    console.log(
      `  glow  ${renderer.toUpperCase().padEnd(3)} ${String(Math.round(stats.glyphs)).padStart(5)} glyphs  ` +
        `${stats.fps.toFixed(1).padStart(7)} fps  cpu ${stats.cpuMsAvg.toFixed(2)}ms/frame`
    );
  }
}

// ---- screenshots -------------------------------------------------------------------------
async function shot(name, renderer, glyphSize, glow) {
  await page.evaluate(
    ([w, h, size, seed, g, r]) => {
      window.__bench.setup({ width: w, height: h, glyphSize: size, seed, glow: g });
      window.__bench.preview({ renderer: r });
    },
    [WIDTH, HEIGHT, glyphSize, SEED, glow, renderer]
  );
  await page.waitForTimeout(1500);
  await page.locator(renderer === 'cpu' ? '#cpu' : '#gpu').screenshot({ path: resolve(resultsDir, name) });
  await page.evaluate(() => window.__bench.preview({ renderer: 'none' }));
}

console.log('› screenshots…');
await shot('canvas2d-cpu.png', 'cpu', 18, false);
await shot('webgl-gpu.png', 'gpu', 18, false);
await shot('webgl-gpu-glow.png', 'gpu', 18, true);
await shot('canvas2d-cpu-glow.png', 'cpu', 18, true);

await browser.close();
server.close();

// ---- output ------------------------------------------------------------------------------
const payload = {
  generatedAt: new Date().toISOString(),
  environment: {
    webglRenderer: gpuName,
    note: 'Headless Chromium; no physical GPU available in this sandbox, WebGL runs on SwiftShader (software).',
    viewport: `${WIDTH}x${HEIGHT}`,
    secondsPerRun: SECONDS,
    seed: SEED,
  },
  results,
};
writeFileSync(resolve(resultsDir, 'results.json'), JSON.stringify(payload, null, 2));

const rows = results.map((r) => {
  const tag = r.experiment ? 'glow' : 'base';
  const renderer = r.renderer === 'cpu' ? 'Canvas2D' : 'WebGL2';
  return `| ${r.glyphSize}px | ${tag} | ${renderer} | ${r.slots} | ${r.fps.toFixed(1)} | ${r.cpuMsAvg.toFixed(2)} | ${r.cpuMsMax.toFixed(2)} |`;
});
const summary = `# Benchmark results (auto-generated)

Environment: ${gpuName}
Viewport: ${WIDTH}x${HEIGHT} · ${SECONDS}s per run · seed 0x${SEED.toString(16)}

| cell size | experiment | renderer | slots | fps | CPU ms/frame (avg) | CPU ms/frame (max) |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

> The fps column depends on the host GPU and, in this sandbox, WebGL runs on SwiftShader
> (software) because there is no physical GPU. The **CPU ms/frame** column is the
> hardware-independent signal: it is the time the JS/CPU spends producing one frame.
> Canvas2D scales linearly with the number of slots; WebGL2 stays flat because all the
> per-glyph work happens in the vertex shader on the GPU.
`;
writeFileSync(resolve(resultsDir, 'summary.md'), summary);
console.log('\n› wrote results/results.json and results/summary.md');
console.log(summary);
