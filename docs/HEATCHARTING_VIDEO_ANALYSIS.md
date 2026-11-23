# HeatCharting reference recording analysis

GMT baseline: `1.1.0-rc.8`, source `a63a96cbff1b72c7cbc2e710cf3cab93d68689e2`. Research only. See the [control inventory](HEATCHARTING_BUTTON_INVENTORY.md) for individual controls and the [GMT blueprint](HEATCHARTING_UI_BLUEPRINT.md) for proposed behavior.

## Evidence and coverage

| Evidence | Extent | Method |
| --- | --- | --- |
| Screen Recording 2026-11-23 at 4.17.51 PM.mov | 00:00.000–07:37.125, 2940 × 1608, one video track | Reviewed the full timeline using contact sheets, one-second extraction from 00:00 through 07:37, 78 selected larger frames, and OCR cross-checking for short-lived labels. Times below are approximate to the nearest sampled second. |
| Screenshot 2026-11-23 at 4.25.22 PM.png | 2940 × 1608 | Measured the full-screen chrome and chart bounds and sampled color pixels. |
| Reference chart URL | Signed-out visit led to the welcome surface | Authenticated browser controls were unavailable. Account creation and sign-in were outside the research scope. [Reference chart](https://heatcharting.com/chart) |
| Official guide | Public product descriptions and interaction documentation | Used for cross-checking and marked as guide-only where applicable. [Official guide](https://heatcharting.com/guide) |

Observed means visible action or visible outcome. Visible-only means a label, menu item, or button appeared and its effect remains unverified. Guide-only describes a published claim. Vendor labels, rendered market values, and visible notifications establish UI evidence. They cannot establish server-side behavior, entitlements, persistence, feed accuracy, or historical completeness. Short transitions between sampled frames can escape detection.

## Full timeline

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

The private evidence index carries the images, their source timestamps and callouts. The Git research branch contains Markdown only. Supplied files, frames, OCR, and imagery containing third-party names or avatars belong outside tracked source.

## Guide cross-checks and coverage limits

The guide describes chart gestures, including drag-to-pan, wheel zoom, axis double-click actions, Shift measurement, and platform-specific snapping/hotkeys. It also describes replay, multiple layouts, alerts, historical and live liquidity, footprints and Flow Map behavior. The video corroborates visible controls and specific actions in the timeline. Recording live depth while a chart is open and guide-described pre-recorded coverage for some instruments are distinct claims. Signed-out access prevented verification of live rule execution, login-gated controls and sample export contents. [Official guide](https://heatcharting.com/guide)
