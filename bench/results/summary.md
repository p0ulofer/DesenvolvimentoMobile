# Benchmark results (auto-generated)

Environment: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
Viewport: 900x600 · 5s per run · seed 0x5eed1234

| cell size | experiment | renderer | slots | fps | CPU ms/frame (avg) | CPU ms/frame (max) |
| --- | --- | --- | --- | --- | --- | --- |
| 12px | base | Canvas2D | 1433 | 20.4 | 4.17 | 49.60 |
| 12px | base | WebGL2 | 1433 | 33.7 | 0.09 | 0.30 |
| 16px | base | Canvas2D | 1067 | 28.7 | 2.70 | 31.00 |
| 16px | base | WebGL2 | 1067 | 39.9 | 0.10 | 2.00 |
| 20px | base | Canvas2D | 766 | 31.3 | 1.95 | 28.80 |
| 20px | base | WebGL2 | 766 | 47.9 | 0.07 | 0.30 |
| 26px | base | Canvas2D | 611 | 40.5 | 1.40 | 28.50 |
| 26px | base | WebGL2 | 611 | 54.0 | 0.09 | 1.00 |
| 32px | base | Canvas2D | 500 | 47.7 | 1.01 | 21.80 |
| 32px | base | WebGL2 | 500 | 59.7 | 0.10 | 2.10 |
| 18px | glow | Canvas2D | 897 | 13.6 | 2.92 | 18.70 |
| 18px | glow | WebGL2 | 897 | 31.1 | 0.11 | 1.30 |

> The fps column depends on the host GPU and, in this sandbox, WebGL runs on SwiftShader
> (software) because there is no physical GPU. The **CPU ms/frame** column is the
> hardware-independent signal: it is the time the JS/CPU spends producing one frame.
> Canvas2D scales linearly with the number of slots; WebGL2 stays flat because all the
> per-glyph work happens in the vertex shader on the GPU.
