/**
 * Benchmark renderer B — WebGL2 (GPU), instanced.
 *
 * Mirrors the app's PHASE 2 philosophy, taken to the extreme: **zero per-frame CPU work**.
 * Every instance carries only *static* parameters (column x, slot, speed, trail, phase,
 * colour, seed). Position, glyph selection and fade are computed in the vertex shader from
 * a single `uTime` uniform, exactly like the app computes them in a Reanimated worklet.
 *
 * Glyphs come from a texture atlas rasterised once with Canvas 2D (the random Unicode pool
 * from the shared core), so the character set stays random.
 */

import { colorAt } from '../../src/features/matrix-rain/core/simulation';

const ATLAS_CELL = 48;
const MAX_FONTS = 6;
const MAX_POOL = 64;

const VERT = `#version 300 es
precision highp float;

in vec2  aCorner;       // 0..1 unit quad
in float aColX;
in float aSlot;
in float aSpeed;
in float aTrail;
in float aPhase;
in float aCycle;
in float aSeed;
in float aCharInterval; // seconds
in float aFontRow;
in vec3  aColor;

uniform float uTime;        // seconds
uniform float uSpeedScale;
uniform float uCellW;
uniform float uCellH;
uniform float uGlowScale;
uniform float uPassAlpha;
uniform float uPoolSize;
uniform float uFontRows;
uniform float uAtlasCols;
uniform vec2  uResolution;

out vec2  vUv;
out vec3  vColor;
out float vAlpha;

uint hash3(uint x, uint y, uint z) {
  uint h = x * 374761393u + y * 668265263u + z * 2246822519u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return h ^ (h >> 16u);
}

void main() {
  // Same model as core/simulation.ts: s = phase + speed * t, wrapped in the column cycle.
  float s = aPhase + aSpeed * uTime * uSpeedScale;
  float cyc = floor(s / aCycle);
  float pos = s - cyc * aCycle;
  float head = pos - aTrail;
  float row = head - aSlot;
  float y = row * uCellH;

  // Glyph flicker: a stateless hash replaces the CPU-side pickGlyph().
  float tick = floor(uTime / aCharInterval + aSlot * 0.37);
  uint g = hash3(uint(aSeed), uint(row + 1024.0), uint(tick + 4096.0)) % uint(uPoolSize);

  vec2 halfSize = vec2(uCellW, uCellH) * 0.5 * uGlowScale;
  vec2 center = vec2(aColX + uCellW * 0.5, y + uCellH * 0.5);
  vec2 p = center + (aCorner - 0.5) * 2.0 * halfSize;

  gl_Position = vec4((p.x / uResolution.x) * 2.0 - 1.0, 1.0 - (p.y / uResolution.y) * 2.0, 0.0, 1.0);

  vUv = vec2((float(g) + aCorner.x) / uAtlasCols, (aFontRow + aCorner.y) / uFontRows);
  vColor = aColor;
  vAlpha = uPassAlpha;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2  vUv;
in vec3  vColor;
in float vAlpha;
uniform sampler2D uAtlas;
out vec4 fragColor;
void main() {
  vec4 tex = texture(uAtlas, vUv);
  float a = tex.a * vAlpha;
  if (a < 0.02) discard;
  fragColor = vec4(vColor, a);
}`;

/** hex "#rrggbb" -> [r, g, b] in 0..1 */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** Rasterises one atlas: rows = fonts, columns = glyph pool. */
function buildAtlas(pool, fonts) {
  const cols = Math.min(pool.length, MAX_POOL);
  const rows = fonts.length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * ATLAS_CELL;
  canvas.height = rows * ATLAS_CELL;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  for (let r = 0; r < rows; r++) {
    ctx.font = `${Math.round(ATLAS_CELL * 0.74)}px ${fonts[r]}`;
    for (let c = 0; c < cols; c++) {
      ctx.fillText(pool[c], c * ATLAS_CELL + ATLAS_CELL / 2, r * ATLAS_CELL + ATLAS_CELL / 2);
    }
  }
  return { canvas, cols, rows };
}

export function createWebGLRenderer({ canvas, state, glow, onGpuUsed }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 not available; the GPU benchmark needs WebGL2.');

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
  }

  // ---- Atlas (random glyph pool x fonts actually used by the columns) ----------------
  const usedFamilies = Array.from(new Set(state.columns.map((c) => c.font.family))).slice(0, MAX_FONTS);
  const atlas = buildAtlas(state.glyphPool, usedFamilies);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // ---- Static instance data ----------------------------------------------------------
  const perInstance = 12; // colX, slot, speed, trail, phase, cycle, seed, charInterval, fontRow, r, g, b
  let count = 0;
  for (const column of state.columns) count += column.trail;
  const data = new Float32Array(count * perInstance);

  let i = 0;
  for (const column of state.columns) {
    const fontRow = Math.max(0, usedFamilies.indexOf(column.font.family));
    for (let slot = 0; slot < column.trail; slot++) {
      const t = slot / Math.max(1, column.trail - 1);
      const color = hexToRgb(colorAt(state.palette, column.hue, t));
      const o = i * perInstance;
      data[o + 0] = column.x;
      data[o + 1] = slot;
      data[o + 2] = column.speed;
      data[o + 3] = column.trail;
      data[o + 4] = column.phase;
      data[o + 5] = column.cycle;
      data[o + 6] = column.seed % 16777216;
      data[o + 7] = column.charIntervalMs / 1000;
      data[o + 8] = fontRow;
      data[o + 9] = color[0];
      data[o + 10] = color[1];
      data[o + 11] = color[2];
      i++;
    }
  }

  const quad = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  const instanceBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  const aCorner = gl.getAttribLocation(program, 'aCorner');
  const instanceAttribs = [
    ['aColX', 1],
    ['aSlot', 1],
    ['aSpeed', 1],
    ['aTrail', 1],
    ['aPhase', 1],
    ['aCycle', 1],
    ['aSeed', 1],
    ['aCharInterval', 1],
    ['aFontRow', 1],
    ['aColor', 3],
  ];

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const uniforms = {};
  for (const name of [
    'uTime', 'uSpeedScale', 'uCellW', 'uCellH', 'uGlowScale', 'uPassAlpha',
    'uPoolSize', 'uFontRows', 'uAtlasCols', 'uResolution', 'uAtlas',
  ]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  return {
    id: 'webgl',
    label: 'WebGL2 instanced (GPU)',
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      if (onGpuUsed) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        onGpuUsed(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      }
    },
    frame(elapsedSeconds, speedScale) {
      const started = performance.now();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      // Static attributes (never re-uploaded -> no per-frame CPU traffic).
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(aCorner);
      gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(aCorner, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      const stride = perInstance * 4;
      let offset = 0;
      for (const [name, size] of instanceAttribs) {
        const loc = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(loc, 1);
        offset += size * 4;
      }

      gl.uniform1f(uniforms.uTime, elapsedSeconds);
      gl.uniform1f(uniforms.uSpeedScale, speedScale);
      gl.uniform1f(uniforms.uCellW, state.grid.cellWidth);
      gl.uniform1f(uniforms.uCellH, state.grid.cellHeight);
      gl.uniform1f(uniforms.uPoolSize, atlas.cols);
      gl.uniform1f(uniforms.uFontRows, atlas.rows);
      gl.uniform1f(uniforms.uAtlasCols, atlas.cols);
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      gl.uniform1i(uniforms.uAtlas, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);

      if (glow) {
        gl.uniform1f(uniforms.uGlowScale, 2.1);
        gl.uniform1f(uniforms.uPassAlpha, 0.35);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      }
      gl.uniform1f(uniforms.uGlowScale, 1);
      gl.uniform1f(uniforms.uPassAlpha, 1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

      return performance.now() - started;
    },
    glyphCount() {
      return count;
    },
    drawCalls() {
      return glow ? 2 : 1;
    },
  };
}
