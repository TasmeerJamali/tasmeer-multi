# Tasmeer Multi: Performance & Telemetry Benchmarks

Automated latency, memory, and frame-rate benchmark verification log.

- **Benchmark 1**: Verified Electron main process cold startup latency (< 850 ms) `[PASS - 2026-11-26]`
- **Benchmark 2**: Verified Chromium partition initialization overhead (< 140 ms) `[PASS - 2026-11-26]`
- **Benchmark 3**: Verified WebContents IPC message round-trip time (< 1.8 ms) `[PASS - 2026-11-26]`
- **Benchmark 4**: Verified RAM usage during idle state with 3 active chat tabs (< 180 MB) `[PASS - 2026-11-26]`
- **Benchmark 5**: Verified RAM usage during continuous token streaming (< 240 MB) `[PASS - 2026-11-26]`
- **Benchmark 6**: Verified ContextIsolation boundary security overhead audit (< 0.2 ms) `[PASS - 2026-11-26]`
- **Benchmark 7**: Verified GPU rasterization throughput at 4K resolution (60 FPS) `[PASS - 2026-11-26]`
- **Benchmark 8**: Verified Display scaling coordinate mapping accuracy across 125% and 150% DPI `[PASS - 2026-11-26]`
- **Benchmark 9**: Verified Global accelerator hotkey latency from background to focused (< 25 ms) `[PASS - 2026-11-26]`
- **Benchmark 10**: Verified Session partition cookie write serialization latency (< 5 ms) `[PASS - 2026-11-26]`
- **Benchmark 11**: Verified Local storage quota and compaction performance check `[PASS - 2026-11-26]`
- **Benchmark 12**: Verified Multi-window tiling redraw latency under active window resize (< 16 ms) `[PASS - 2026-11-26]`
- **Benchmark 13**: Verified Audio stream capture pipeline latency on Windows CoreAudio (< 40 ms) `[PASS - 2026-11-26]`
