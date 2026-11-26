# Reference video and GMT analysis workspace

The supplied recording runs from 00:00 to 07:20.66. The review follows that recording and its companion inventory. The baseline is `f443413b9f7741854b0eece57c7606dff1a11fc1`, the main revision that integrated the Watchlist refresh correction. Reference frames, local screenshots, and the disposable profile stay outside tracked source.

## Stage A · Video and layout review

| Time | Verified observation | GMT implementation or data boundary |
| --- | --- | --- |
| 00:04–00:17 | Symbol Search opens and shows NIFTY matches and market categories | Shared directory dialog with market tabs, existing structured filters, canonical identity, and keyboard navigation. |
| 00:21–00:40 | Compare Symbol opens; BANKNIFTY offers same percentage scale, new price scale and new pane. A comparison line appears beside the candles | GMT implements an overlaid return comparison on a labeled left percentage scale. The primary chart keeps its own price scale. The other two placements remain outside this implementation. |
| 00:50–01:08 | Month button hover and a menu of chart styles | GMT keeps the ten current timeframes and adds a grouped selector. Its style selector enables 13 implemented presentations. Seeing a label in the recording did not verify its construction. |
| 01:17–01:29 | Indicator browser opens and applies a 52-week high/low tool | GMT keeps its existing indicators and adds search, category browsing, Favorites and Recently Used. |
| 01:52–02:56 | Favorites, My Scripts, alert dialog and script category labels are visible | GMT adds a typed local library with Indicators, Analytical Rules and Libraries, plus the existing local alert workflow. |
| 03:02–03:38 | The editor displays RSI and smoothing parameters and a study appears on the chart | GMT's original recipe supports RSI with EMA and WMA smoothing. The recording shows RSI 9, EMA 3 and WMA 21. The complete original source and its behavior were unavailable. |
| 03:44–04:35 | An indices search shows index rows | Search Indices starts with Indian indices and offers Global. The index dialog exposes market, provider, currency and status. |
| 04:50–05:54 | Index detail and constituent controls are visible | GMT offers View Chart and Add to Watchlist. The configured feeds lack verified constituent membership and weights for this feature. |
| 06:07–06:28 | Chart event badges and symbol summary/news are visible | GMT places verified daily Yahoo dividends on matching displayed bars. Earnings and news require a verified feed contract. The existing Watchlist summary remains available. |
| 06:45–07:20 | The Data Window follows the crosshair; a Screener surface is displayed | GMT's dock follows the active chart and shows provider OHLC, volume, bar change and applicable event detail. GMT retains its own Screener. The reference showed Coming Soon. |

The reference geometry was measured on review frames resized to 1470 × 772 pixels. GMT geometry uses CSS pixels from a 1440 × 834 native Electron viewport. Aspect ratio, title bar, and device-scale differences explain why vertical offsets are not directly comparable.

| Region | Reference measurement | GMT review layout |
| --- | --- | --- |
| Top toolbar and drawing rail | About 36 px high and 46 px wide | 46 px toolbar below the native 26 px title strip and a 46 px drawing rail. |
| Analysis rail and right panel | About 47 px and 315 px respectively when open | 45 px rail and 320 px Watchlist. Data Window is 300 px, reduced to 248 px on narrow viewports. |
| Symbol Search / Compare | Centered, about 872 px wide at 00:13 | Shares GMT's 620 px search dialog and structured filters. |
| Indicators | About 872 px wide at 01:17, with an approximately 180 px navigation column | 850 px dialog and a 260 px catalog column. Active indicator settings and presets stay on the right. |

Compare and Search Indices use the same query and result components as chart and Watchlist search. The Data Window uses the existing right rail and active-pane state. GMT uses its existing typography, theme, and attribution.

## Stages B and C · Market overlays and chart presentation

- Chart and Watchlist search preserve their own selection intents. Compare supports three distinct canonical instruments per pane and uses shared history leases. It aligns exact published timestamps and starts all returns at the first common positive close. Missing values are left blank. Comparisons pause in replay and when the chart is hidden.
- The grouped timeframe selector uses the existing interval set and keeps the toolbar shortcuts. No additional resolutions were inferred from the video.
- The 13 available styles are Bars, HLC Bars, Candles, Hollow Candles, High–Low, Line, Line with Markers, Step Line, Area, Baseline, Columns, Heikin Ashi, and Three-Line Break. The latter is a close-only presentation on observed timestamps. The other displayed chart styles require separately specified render or data contracts.
- Provider OHLC remains the source for crosshair values, indicators, drawings, and alerts. Changing presentation uses the candles already loaded for the pane.

## Stages D and E · Local studies and provider-derived detail

- The typed editor accepts a price input and bounded RSI, EMA and WMA lengths. It can verify a recipe, save up to five revisions per study, and apply a chosen revision. Libraries can supply a starting recipe. Applied studies keep their own copy, so subsequently saved edits cannot silently change a chart or alert.
- Local analytical rules select one study output, a threshold, and crossing direction. Existing historical alerts evaluate completed provider candles and retain restart priming and freshness checks.
- The Data Window displays the inspected bar or the latest displayed bar, marks stale history and partial bars, and shows the corresponding daily Yahoo dividend when one was supplied and matched. Events remain hidden during historical replay.
- Options, trading actions, additional providers, executable scripts and unverified earnings/news/weights are outside the workspace. Reference labels such as Volume Candles, HLC Area, Renko, Kagi, Point & Figure, Range Bars, Session Volume Profile, Time Price Opportunity and OrderFlow chart are deferred. GMT's existing live Order Flow dock remains available.

## Reproducible local verification

- Run `npm run build`, `npm test`, and `npm run test:macos` on native Apple Silicon. The native runner includes `reference-analysis-math.mjs` and `reference-analysis-ui.mjs`. The latter creates its own disposable profile and records screenshots under `test-results/reference-analysis/`.
- The fixture tests exercise grouped intervals, chart presentations without additional history requests, shared percent comparisons, the Data Window, index details, local revision persistence and alerts. The existing Watchlist race, drawing persistence, fullscreen, warm restore and Grid budget checks remain in the complete suite.
- Screenshot filename prefixes refer to the video minute and second. The checked-in source contains neither frame captures nor fixture results. Native Windows verification and the intermittent Electron/macOS fullscreen and focus issue remain open.
