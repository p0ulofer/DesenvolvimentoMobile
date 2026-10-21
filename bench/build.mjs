/**
 * Bundles the benchmark (plus the app's shared simulation core, which is TypeScript)
 * into `dist/bundle.js` and copies the HTML shell next to it.
 *
 * Nothing here touches the Expo app; the bench is a standalone measurement harness.
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(here, 'dist');

mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [resolve(here, 'src/main.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome110'],
  sourcemap: true,
  outfile: resolve(outdir, 'bundle.js'),
  logLevel: 'info',
});

copyFileSync(resolve(here, 'index.html'), resolve(outdir, 'index.html'));
console.log('bench built ->', outdir);
