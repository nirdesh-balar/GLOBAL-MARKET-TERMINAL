# HeatCharting reference recording analysis

GMT baseline: `1.1.0-rc.8`, source `a63a96cbff1b72c7cbc2e710cf3cab93d68689e2`. Research only. See the [control inventory](HEATCHARTING_BUTTON_INVENTORY.md) for individual controls and the [GMT blueprint](HEATCHARTING_UI_BLUEPRINT.md) for proposed behavior.

## Evidence and coverage

| Evidence | Extent | Method |
| --- | --- | --- |
| Screen Recording 2026-11-23 at 4.17.51 PM.mov | 00:00.000–07:37.125, 2940 × 1608, one video track | Reviewed the full timeline using contact sheets, one-second extraction from 00:00 through 07:37, 78 selected larger frames, and OCR cross-checking for short-lived labels. Times below are approximate to the nearest sampled second. |
| Screen Recording 2026-11-23 at 4.30.22 PM.mov | 00:00.000–03:03.237, 2940 × 1608, one video track | Supplement to the first recording. Reviewed six contact sheets covering the timeline, 184 one-second frames with OCR, and 47 selected larger frames. B-series references use this recording’s own clock. |
| Screenshot 2026-11-23 at 4.25.22 PM.png | 2940 × 1608 | Measured the full-screen chrome and chart bounds and sampled color pixels. |
| Reference chart URL | Signed-out visit led to the welcome surface | Authenticated browser controls were unavailable. Account creation and sign-in were outside the research scope. [Reference chart](https://heatcharting.com/chart) |
| Official guide | Public product descriptions and interaction documentation | Used for cross-checking and marked as guide-only where applicable. [Official guide](https://heatcharting.com/guide) |

Observed means visible action or visible outcome. Visible-only means a label, menu item, or button appeared and its effect remains unverified. Guide-only describes a published claim. Vendor labels, rendered market values, and visible notifications establish UI evidence. They cannot establish server-side behavior, entitlements, persistence, feed accuracy, or historical completeness. Short transitions between sampled frames can escape detection.

## First recording timeline

| Time | Observed interaction and result |
| --- | --- |
| 00:00–00:02 | BTC 15m candles, two EMA overlays, crosshair and watchlist tooltip. The chart controls and both rails are visible. |
| 00:03–00:42 | Opens the symbol picker, visits several market and India-specific categories, scrolls results, and narrows query from `n` to `nifty`. Selecting a NIFTY row returns to a NIFTY chart. Some category chips are visible without a witnessed visit. |
| 00:43–01:04 | NIFTY loads. Quick intervals change and a loading indicator appears around 00:52. The expanded menu exposes custom entry, tick through weekly groups, and favorites. Adding a custom interval and changing a favorite remain unverified. |
| 01:05–01:14 | Opens the chart representation chooser and scrolls its variants. Volume footprint displays a feed limitation. Candles remain visible when the chooser closes. |
| 01:15–01:31 | Opens the indicator browser, explores built-ins, chips, and search/list areas. The count changes from 2 to 7 across the study sequence. Account and community script controls are visible. |
| 01:32–01:47 | Opens template naming and template views. In the technicals browser, Smart Money/FVG and Aroon/ADX-family studies are selected or appear after selection. The chart gains overlays and oscillator panes. No durable template save was verified. |
| 01:48–02:06 | Study panes are visible. Global indicator visibility hides then restores studies. Heatmap settings open, and NIFTY reports unavailable order-book data with a futures suggestion. Chart overlays visible under that warning do not verify liquidity or volume-at-price data. |
| 02:07–02:24 | Alert action reports an Indian-market restriction. Crosshair traverses panes. Legend controls hide or remove some studies, leaving the two EMA overlays. No alert delivery demonstrated. |
| 02:25–02:56 | Layout chooser and sync options appear. Chart settings tabs are visited. Overflow offers export/settings/shortcuts and navigation. No changed layout, saved settings, export file, or shortcut action is established. |
| 02:57–03:24 | Opens the watchlist/details dock, scrolls and expands/collapses sections. Selecting Gold changes the chart. Multiple tabs/lists and quote data are visible. |
| 03:25–03:50 | List management and overflow menus appear. Switches to a Nifty 500 list; COPPER is also visible in the sequence. Section and column actions are exposed. A list mutation and restart persistence remain unverified. |
| 03:51–04:05 | Alerts dock shows an offline service and recent-trigger area. A book/time-and-sales tooltip appears. Object tree/data window exposes the instrument and EMA rows. Row edits, reordering and data-window detail remain unverified. |
| 04:06–04:17 | Strategy Tester, Screener, Options Chain, a paper-trading tab and Pine panels open in succession. The Screener shows rows and the options panel shows a NIFTY chain. The paper panel displays account and position controls. Strategy, script and order execution remain unverified. |
| 04:18–04:25 | Community surface then options display. Community identities and messages are omitted from research evidence. |
| 04:26–04:38 | Flow Radar shows a sweep display, events/filter chips, periods, and symbol or settings actions. Detection accuracy, an actual event trigger, order-book display, and chart marker persistence remain unverified. |
| 04:39–04:53 | Trade Journal and product menu appear. Metrics and journal controls are visible. No account, trade, or journal mutation is demonstrated. |
| 04:54–05:12 | Date/range popups show inputs and actions. XAU daily history is visible; the chart view shifts and exposes older samples. A successful typed date transaction and exact input gestures remain unverified. |
| 05:13–05:38 | Delete control reports removal with undo guidance. Tool-state icons appear. A dragged measurement displays price/bar statistics in a blue overlay. |
| 05:39–06:02 | Text is placed, with floating edit controls. Pattern tooltip and shapes menu appear. Brush/shape variants are visible; only the placements later distinguishable are credited. |
| 06:03–06:23 | Forecast/measurement flyout exposes position, forecast, range, anchored VWAP and fixed-range volume profile tools. Risk/forecast and range-style overlays appear. Their labels do not establish any actual trade or provider-level volume profile. |
| 06:24–06:49 | Additional freehand, filled and polygon-like marks are placed or selected. Editing bar and visual changes are visible. The exact identity of closely related shapes is unverified where the menu and resulting geometry cannot be matched. |
| 06:50–07:08 | XABCD-like point drawing appears. Fibonacci/Gann, pitchfork and lines flyouts open, exposing item choices. Only opening the listed menus is credited for the unselected variants. |
| 07:09–07:21 | Additional channel/diagonal overlays are placed and selected. Remove-all is invoked, with toast and undo hint, and the overlays disappear. |
| 07:22–07:37 | Clean XAU chart and crosshair. An OS screenshot preview and macOS capture overlay end the recording. They are outside the reference product. |

## Supplemental recording timeline

| Time | Observed interaction and result |
| --- | --- |
| 00:00–00:08 | XAU 1h chart with EMA 9 and EMA 20. Crosshair and legend interaction; the study toolbar is used to reach the indicator browser. |
| 00:09–00:16 | Selects Smart Money Concepts and Liquidity Pools & Sweeps. Addition toasts and the legend count increasing from two to six show the same study entries can be added more than once in this sequence. Red and green bands and change-of-character, break-of-structure and sweep labels appear on the chart. Algorithms and data inputs are unverified. |
| 00:17–00:34 | Uses the drawing visibility affordance during inspection. The bands remain visible. Expands and collapses the study legend and passes over per-study controls. |
| 00:35–00:44 | Opens two EMA settings dialogs with lengths 9 and 20. Source, visibility, color, width, line style, Save and Cancel are visible. A committed change is unverified. |
| 00:45–00:53 | Removes the added study instances from the chart legend. The bands and labels disappear and the two EMA lines remain. |
| 00:54–01:06 | Reopens the indicator browser, types `rsi` and adds Relative Strength Index and Stochastic RSI. Both additions show confirmation and separate panes. RSI Divergences and Connors RSI are visible result rows. |
| 01:07–01:23 | Crosshair traverses price and the oscillator panes. One time cursor aligns the panes, which display independent numeric scales and hovered values. Visible range shifts across the same chart. |
| 01:24–01:36 | Opens Stochastic RSI settings with 14/14/3/3 inputs and 80/20 reference levels; returns to the chart and opens RSI settings with length 14 and 70/30 levels. Source and style options are visible. Changed settings and persistence are unverified. |
| 01:37–01:51 | Window view moves between earlier bars and the latest region. The price and study panes move together. The exact mouse gestures and return-to-latest sequence are unverified. |
| 01:52–01:59 | Uses the plus near the crosshair price scale to open a Create alert form twice. XAU on the chart maps to XAUUSDT in the form, interval 1h. The default Close-crosses threshold changes from 3494.21 to 3784.16 with the selected chart price. Forms close without a visible success result. Alert save, trigger and delivery remain unverified. |
| 02:00–02:21 | Inspects values, moves the view and removes RSI and Stochastic RSI from the pane legends. The panes disappear, expanding the remaining chart. |
| 02:22–02:25 | Opens and closes the Keyboard shortcuts dialog. Individual hotkey execution is unverified. |
| 02:26–02:44 | Adjusts the chart view and uses the percent control. Percentage tick labels replace absolute prices while active, then absolute labels return. The exact baseline for reference percentage values is unverified. |
| 02:45–02:55 | Opens the Chart time zone dialog from the bottom clock, then scrolls Local time, UTC and named regions. Search, offset, Cancel and Apply are visible. A different zone or a persisted selection is unverified. |
| 02:56–03:03 | Chart inspection and a hover showing the Order book & time and sales label. Panel activity and a feed remain unverified. The macOS capture overlay appears at the end. |

## Private annotated frame index

| Frame | Time | Inspect |
| --- | --- | --- |
| A01 | Supplied still | Header, left tool rail, price and time scales, right rail, bottom. |
| A02 | 00:04 | Instrument picker and category filters. |
| A03 | 01:18 | Indicator groups, search and study rows. |
| A04 | 02:00 | Heatmap controls and the order-book restriction. |
| A05 | 02:44 | Chart settings tabs and canvas controls. |
| A06 | 03:28 | Watchlist dock, list controls and sections. |
| A07 | 04:12 | Options panel and analysis columns. |
| A08 | 04:32 | Flow Radar controls and filter chips. |
| A09 | 05:33 | Canvas measurement and rulers. |
| A10 | 06:05 | Forecast/measurement drawing menu. |
| A11 | 07:07 | Line tool family menu. |
| B01 | 00:09 | Smart-money study rows in the supplemental recording. |
| B02 | 00:20 | Study bands, structure and sweep labels. |
| B03 | 00:36 | EMA inputs and style. |
| B04 | 01:07 | Price and synchronized oscillator panes. |
| B05 | 01:24 | Stochastic RSI inputs, styles and levels. |
| B06 | 01:32 | RSI inputs, style and levels. |
| B07 | 01:54 | Price-seeded alert form. |
| B08 | 02:22 | Keyboard shortcut list. |
| B09 | 02:36 | Percentage price scale. |
| B10 | 02:46 | Time-zone search and named regions. |
| B11 | 02:58 | Order-book rail tooltip. |

The private evidence index carries the images, their source timestamps and callouts. The Git research branch contains Markdown only. Supplied files, frames, OCR, and imagery containing third-party names or avatars belong outside tracked source.

## Guide cross-checks and coverage limits

The guide describes chart gestures, including drag-to-pan, wheel zoom, axis double-click actions, Shift measurement, and platform-specific snapping/hotkeys. It also describes replay, multiple layouts, alerts, historical and live liquidity, footprints and Flow Map behavior. The video corroborates visible controls and specific actions in the timeline. Recording live depth while a chart is open and guide-described pre-recorded coverage for some instruments are distinct claims. Signed-out access prevented verification of live rule execution, login-gated controls and sample export contents. [Official guide](https://heatcharting.com/guide)
