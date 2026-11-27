# Reference video and GMT analysis workspace

The supplied recording runs from 00:00 to 07:20.66. The review follows that recording and its companion inventory. The baseline is `f443413b9f7741854b0eece57c7606dff1a11fc1`, the main revision that integrated the Watchlist refresh correction. Reference frames, local screenshots, and the disposable profile stay outside tracked source.

## Stage A · Video and layout review

| Time | Verified observation | GMT implementation or data boundary |
| --- | --- | --- |
| 00:04–00:17 | Symbol Search opens and shows NIFTY matches and market categories | The shared directory dialog uses a single scrolling category strip and preserves canonical identity and keyboard selection. |
| 00:21–00:40 | Compare Symbol opens and a comparison line appears beside the candles | Removed from GMT in the 2026-11-27 correction. Native percentage mode for the primary instrument remains available. |
| 00:50–01:08 | Month button hover and a menu of chart styles | The main toolbar uses the ten existing timeframe shortcuts. Its style selector enables 13 implemented presentations. Seeing a label in the recording did not verify its construction. |
| 01:17–01:29 | Indicator browser opens and applies a 52-week high/low tool | GMT keeps its existing indicators and adds search, category browsing, Favorites and Recently Used. |
| 01:52–02:56 | Favorites, My Scripts, alert dialog and script category labels are visible | GMT adds a typed local library with Indicators, Analytical Rules and Libraries, plus the existing local alert workflow. |
| 03:02–03:38 | The editor displays RSI and smoothing parameters and a study appears on the chart | GMT's original recipe supports RSI with EMA and WMA smoothing. The recording shows RSI 9, EMA 3 and WMA 21. The complete original source and its behavior were unavailable. |
| 03:44–04:35 | An indices search shows index rows | Standard Symbol Search includes Indices & ETFs and IN Indices. A selected index opens its constituent table from the chart data controls. |
| 04:50–05:54 | Index detail and constituent controls are visible | GMT exposes a searchable table with explicit CSV import, a destination Watchlist selector, View Chart, and Add to Watchlist. Price and membership provenance are displayed separately. |
| 06:07–06:28 | Chart event badges and symbol summary/news are visible | GMT places verified daily Yahoo dividends on matching displayed bars. Earnings and news require a verified feed contract. The existing Watchlist summary remains available. |
| 06:45–07:20 | The Data Window follows the crosshair; a Screener surface is displayed | GMT's dock follows the active chart and shows provider OHLC, volume, bar change and applicable event detail. GMT retains its own Screener. The reference showed Coming Soon. |

The reference geometry was measured on review frames resized to 1470 × 772 pixels. GMT geometry uses CSS pixels from a 1440 × 834 native Electron viewport. Aspect ratio, title bar, and device-scale differences explain why vertical offsets are not directly comparable.

| Region | Reference measurement | GMT review layout |
| --- | --- | --- |
| Top toolbar and drawing rail | About 36 px high and 46 px wide | 46 px toolbar below the native 26 px title strip and a 46 px drawing rail. |
| Analysis rail and right panel | About 47 px and 315 px respectively when open | 45 px rail and 320 px Watchlist. Data Window is 300 px, reduced to 248 px on narrow viewports. |
| Symbol Search | Centered, about 872 px wide at 00:13 | GMT uses a responsive dialog up to 660 px wide and puts category shortcuts immediately between the input and results. |
| Indicators | About 872 px wide at 01:17, with an approximately 180 px navigation column | GMT's 850 px dialog uses full-width single-line navigation and splits the catalog from active indicators and presets. |

Symbol Search uses one directory for chart and Watchlist selection. Open Data Window from the right rail to inspect the active pane. The workspace footer keeps the TradingView attribution and local save status.

## Stages B and C · Market overlays and chart presentation

- Chart and Watchlist search preserve their own selection intents. Older workspace panes with a comparison field load through the normal pane schema and retain their original settings. The removed field is omitted on subsequent saves.
- Existing main toolbar shortcuts and independent multi-chart intervals use the current interval set.
- The 13 available styles are Bars, HLC Bars, Candles, Hollow Candles, High–Low, Line, Line with Markers, Step Line, Area, Baseline, Columns, Heikin Ashi, and Three-Line Break. The latter is a close-only presentation on observed timestamps. The other displayed chart styles require separately specified render or data contracts.
- Provider OHLC remains the source for crosshair values, indicators, drawings, and alerts. Changing presentation uses the candles already loaded for the pane.
- The custom chart type menu groups OHLC, line, area, other price, and calculated styles. It opens from the active-chart toolbar or any chart pane. Use arrow keys, Home, End and Enter to choose a style, or Escape to close and return focus to the trigger. It uses the current theme and scrolls within the viewport.
- The November 27 GMT recording shows the native popup at 00:04–00:18. The supplied reference shows an anchored menu at 00:00–00:02, scrolling at 00:06–00:09, and actual selection of Hollow Candles, Step Line and Line with Markers.
- Open Data → Data details for source, retrieval time, freshness, and limitations. The toolbar overflow opens Market data diagnostics. The footer retains TradingView attribution and save status.

## Stages D and E · Local studies and provider-derived detail

- The typed editor accepts a price input and bounded RSI, EMA and WMA lengths. It can verify a recipe, save up to five revisions per study, and apply a chosen revision. Libraries can supply a starting recipe. Applied studies keep their own copy, so subsequently saved edits cannot silently change a chart or alert.
- Local analytical rules select one study output, a threshold, and crossing direction. Existing historical alerts evaluate completed provider candles and retain restart priming and freshness checks.
- The Data Window displays the inspected bar or the latest displayed bar, marks stale history and partial bars, and shows the corresponding daily Yahoo dividend when one was supplied and matched. Events remain hidden during historical replay.
- Open the index through Symbol Search. In the selected pane, open Data and choose Index constituents. NIFTY 50 uses the canonical Yahoo Finance index `yahoo:%5ENSEI:NSE:index`.
- NIFTY 50 and NIFTY 500 accept the official files linked on NSE's index pages through the native file picker. GMT validates the expected filename, header, row count and unique symbols/ISINs, then stores membership in the current profile. The roster matches to the local NSE directory by exact ISIN and series. An unresolved row retains its imported identity and has disabled chart and Watchlist actions. [NIFTY 50](https://www.nseindia.com/static/products-services/indices-nifty50-index) · [NIFTY 500](https://www.nseindia.com/static/products-services/indices-nifty500-index)
- The published membership CSV has no weight column or effective date. GMT shows weights as unavailable and records the import date separately from the optional source date. Use an official effective date if separately documented for the file. Membership import and viewing use local data. Available price cells are read from the existing in-memory Yahoo Finance daily quote cache with their own observation date and staleness. The product uses manual import and does not distribute the CSV. [NSE Indices terms of use](https://www.niftyindices.com/terms-of-use)
- Options, trading actions, additional providers, executable scripts and unverified earnings/news/weights are outside the workspace. Reference labels such as Volume Candles, HLC Area, Renko, Kagi, Point & Figure, Range Bars, Session Volume Profile, Time Price Opportunity and OrderFlow chart are deferred. GMT's existing live Order Flow dock remains available.

## Reproducible local verification

- Run `npm run build`, `npm test`, and `npm run test:macos` on native Apple Silicon. The native runner includes `reference-analysis-math.mjs`, `reference-analysis-ui.mjs`, `index-constituents-ui.mjs` and `chart-menu-ui.mjs`. UI tests use disposable profiles and save screenshots under `test-results/`.
- The fixture tests exercise chart presentation without added history requests, normal timeframe shortcuts, compact search, legacy comparison removal, the Data Window, typed studies, local alerts, and index CSV import and handoffs. The existing Watchlist race, drawing persistence, fullscreen, warm restore and Grid budget checks remain in the complete suite.
- Screenshot filename prefixes refer to the video minute and second. The checked-in source contains neither frame captures nor fixture results. Native Windows verification and the intermittent Electron/macOS fullscreen and focus issue remain open.
