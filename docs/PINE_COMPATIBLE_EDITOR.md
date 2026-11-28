# GMT Pine-compatible Editor

Open **Indicators → My Scripts → New Script** to keep the editor beside the active chart. Verify displays a line and column for unsupported syntax. Save makes a local revision, Save As creates another script, and Add to Chart uses the saved source. An edit to a saved script updates its existing chart instances on the latest revision. Older revisions can be opened for inspection and saved as a new revision. The chart legend and pane controls manage instance visibility and removal. The editor keeps the chart visible and supports vertical and horizontal source scrolling, line numbers, syntax highlighting, native text undo and indentation with Command+] or Control+].

## Supported source

| Area | Supported in GMT |
| --- | --- |
| Declaration | Pine version 5 or 6 with `indicator()`, and a tested v4 translation for `study()`, unqualified moving-average functions, legacy typed `input()`, and `transp` on visual calls. The default version is 6. `title`, `shorttitle` and `overlay` are accepted. |
| Data and expressions | Chart OHLCV, `hl2`, `hlc3`, `ohlc4`, immutable variables, arithmetic, numeric comparisons, Boolean operators, ternaries, `na`, `na()` and numeric `nz()`. |
| Inputs | `input.int()`, `input.float()` and `input.source()`. Defaults and bounds are written in source. Source inputs point to a chart OHLCV series or a supported derived price. |
| Studies | `ta.sma()`, `ta.ema()`, `ta.wma()` and `ta.rsi()`. Lengths are constant integers from 1 to 500. EMA starts at the first valid value. RSI uses Wilder averages. Missing inputs remain gaps and are excluded from moving-average windows. |
| Visuals | Up to eight `plot()`/`hline()` calls, widths 1–4, named and hex colors, `color.new()`, and up to four conditional `fill()` calls. Fill handles refer to two plots or two horizontal lines. |

The editor supports a deliberately limited indicator language. Arrays and maps, user functions, loops, branches expressed as statement blocks, history indexing, mutable state, strategy statements, order functions, alert statements, imported libraries, cross-symbol requests and unsupported drawing or plot styles produce diagnostics. GMT local analytical alerts remain available separately. GMT interprets only the accepted expression syntax and does not use a Pine or ChartScript runtime supplied by the reference product. [Pine v4 to v5 migration](https://www.tradingview.com/pine-script-docs/migration-guides/to-pine-version-5/) · [Pine fills](https://www.tradingview.com/pine-script-docs/visuals/fills/)

## Storage and execution

The authenticated local workspace stores script IDs, source, bounded metadata and the most recent five revisions of each of up to 20 scripts. Chart instances store the script ID, name and visibility. Each chart supports three total local studies, including legacy typed instances. The parser accepts 8,192 characters, 1,200 tokens, 24 parenthesis levels and 112 calculation nodes, and the chart evaluates up to its most recent 8,000 candles. Parsing and calculation use fixed TypeScript operations on data in memory. Source cannot access files, the network, operating-system commands, accounts or execution APIs. A script reads the active chart's existing data and does not request history.

Legacy typed scripts keep their original records, revisions and existing chart and alert behavior. A typed indicator can be opened as an editable source draft and saved separately. The historical typed EMA uses an SMA seed, so converted source can differ during warm-up. Existing installations and profiles need no destructive migration.

## Reference review and acceptance

| Recording | Observed | GMT workflow |
| --- | --- | --- |
| 09:54:20, 00:00–00:17 | Left navigation switches between personal lists and Technicals. Overlays and Oscillators change the visible results. | Dedicated left navigation and a single filter row inside Technicals. Active indicator management opens separately in the same dialog. |
| 09:54:20, 00:20–00:42 | My Scripts lists Hilega-Milega. The reference also shows Strategies and Libraries tabs. | My Scripts lists local indicator source and recoverable legacy records with no strategy or marketplace menu. |
| 09:55:17, 00:27–00:39 | Favorites and Technicals display compact list rows and star controls. | GMT retains its 69 built-in studies and shows favorites and recent items in the same list layout. |
| 09:55:17, 00:43–00:59 | The ChartScript editor opens alongside the chart. Verify, Save, Add to Chart and a Save dialog are visible. | GMT's independent Pine subset editor verifies source, saves revisions, and uses chart data to draw saved plots and fills. |

`scripts/pine-study-fixture.mjs` is an original acceptance script based on the supplied Hilega-Milega behavior. It uses RSI 9, EMA 3, WMA 21, a level at 50 and conditional red/aqua fill in a separate pane. `scripts/pine-study-math.mjs` checks all 330 bars against independent calculations. `scripts/pine-workspace-ui.mjs` checks actual chart pixels, source diagnostics, save/apply, revision updates, restart, chart instance removal and zero additional historical requests from presentation and script operations.
