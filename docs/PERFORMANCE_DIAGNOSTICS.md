# Local performance diagnostics

Open Settings and expand **Performance diagnostics**. The panel samples at five-second intervals while visible. It retains one sample in the renderer and one previous process reading in Electron to calculate CPU. Collapsing the section, closing Settings or hiding the renderer document stops scheduled reads. A read already in progress can finish.

- Process memory is reported in MiB. Electron reports working sets for the main and renderer processes. The owned Python backend reports resident memory on macOS. The sum of these three values can include shared pages more than once. Electron helpers are outside that sum.
- CPU is the change in process CPU time divided by the monotonic sample interval, expressed as a percentage of one core. The actual interval is displayed. An unavailable process or a new PID can leave CPU unavailable for a sample.
- Candle cache size is the existing service estimate. It is included in the Python process's memory use and should be read separately from the operating-system measurement. History and streaming counters cover the current application session.
- Charts restore measures from a layout commit or a return to Charts to the first ready frame. It includes the requested chart count. It is separate from the native fixture's click-to-frame acceptance measurement.
- A build from a clean official-origin checkout displays its source revision. An unverified revision and unsupported process readings show **Unavailable**.
- The panel requests only local counters over the existing authenticated loopback connection. It displays error presence without raw error messages and sends no telemetry.

## Native measurement

Use the guarded source launcher and offline fixtures in disposable profiles. Keep native tests serial and preserve the host's display settings between runs. Run the corresponding build before each measurement. Record the source tree and runtime with the output.

```sh
node scripts/performance-diagnostics-unit.mjs
GMT_PERF_TRACE=test-results/performance-trace.jsonl node --import ./scripts/performance-probe.mjs scripts/terminal-ui.mjs
node scripts/performance-study-ui.mjs --timing-only
GMT_EXPECT_MEMO=1 node scripts/performance-study-ui.mjs
node scripts/performance-diagnostics-ui.mjs
```

The trace also supports `chart-grid-ui.mjs`, `study-pane-resize-ui.mjs`, `order-flow-ui.mjs`, `pine-workspace-ui.mjs` and `watchlist-management-ui.mjs`. Use separate trace files for each source build. The diagnostics fixture's `--baseline` option runs the streaming lifecycle on an earlier build. It uses the same 15-minute fixture before switching to the public stream emulator.

Compare native samples at equivalent chart counts, intervals and settle points. The trace records process-tree RSS from `ps`, Chromium allocated and used JS heap, and estimated candle cache bytes separately. These numbers can fluctuate independently. A rising RSS reading alone does not establish retained objects. The crosshair scan probe counts point visits, and the timing-only mode measures the same gestures without that probe.
