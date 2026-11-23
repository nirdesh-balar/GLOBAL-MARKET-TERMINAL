# Reference geometry and GMT workspace blueprint

The reference measurements describe the supplied screenshot. The proposed workspace uses original GMT composition, labels, colors, icons and code. It carries over familiar charting patterns such as a persistent chart canvas, contextual inspectors and an anchored drawing toolbar.

## Measured reference

All initial values are image pixels from the 2940 × 1608 screenshot. Approximate equivalents at a 2× capture scale are shown for comparison. Browser zoom and CSS dimensions were unavailable. Bounds are rounded near anti-aliased separators.

| Region | Reference bounds | Approximate size at 2× |
| --- | --- | --- |
| Header | Full width, image y≈6–97 | ~46 CSS px high |
| Left drawing rail | x≈0–91, between header and bottom | ~46 px wide |
| Plot | x≈92–2703, y≈97–1498 excluding time labels | ~1306 × 701 px |
| Price scale | x≈2704–2846 | ~71 px wide |
| Right tool rail | x≈2850–2939 | ~45 px wide |
| Time scale and bottom bar | time y≈1498–1547, bottom y≈1548–1607 | ~25 px and ~30 px high |
| Rail cadence | ~70–74 physical px between adjacent primary icons | ~35–37 px |

The left end of the header combines product mark, instrument and interval. Chart type, studies, liquidity, alert/replay and history actions follow. Layout/workspace, appearance and overflow sit toward the trailing end. The left rail opens drawing families adjacent to the active icon. The right rail opens watchlist, alerts and other contextual panels. Time ranges and the panel switches share bottom space. The chart legend begins near the upper left of the plot, aligned to the symbol, and the price marker uses the right scale.

Representative reference pixels: canvas `#14151A`, rail `#17191F`, separator `#21232E`, grid `#1C1C21`, axis text `#CDD1DE`, icons `#8B90A1`, up candle `#64A994`, down candle `#D13946`, blue EMA `#507BF2` and green EMA `#90F781`. Samples reflect this still and may include blending. A01 in the private evidence index marks the regions. A02–A11 annotate the overlays and control families. [Timeline and frame index](HEATCHARTING_VIDEO_ANALYSIS.md)

## Proposed GMT desktop composition

| Region | Placement and sizing | GMT behavior |
| --- | --- | --- |
| Navigation | Primary 44 px title/toolbar with separate workspace mode selector; a second 34–36 px contextual strip only where controls need it | Keep Charts and Advanced Chart Grid one click apart. Primary row owns instrument/search, workspace, panel and window actions. Context strip owns interval, candle type, study count, replay and the focused chart settings. |
| Drawing rail | Left, 48 px default; flyout anchored to the group with available-space collision handling | Preserve 86 tools and existing favorites, visibility, lock, snapping and scoped deletion. Labels identify tool intent. Contextual editing supports anchors, styles and deletion with undo. |
| Chart | Fill remaining space; preserve a readable minimum chart area with a fluid price scale and stable right gutter | Candles, OHLC, volume, study legends, data continuity and source/freshness badge. Sync follows current opt-in policy. Move or hide a panel without reconstructing the chart. |
| Analysis dock | Right, resizable ~280–384 px. Use text tabs for Watchlist, Scanner, Alerts, and Layers/Data | A single active tab owns focus. Row Enter or double-click targets the active chart; a separate menu can send to supported Grid targets. Collapse to a labeled toggle. Keep quote state, exchange session and source visible. |
| Bottom utility strip | ~34–36 px at 1280 × 800; narrower view moves secondary controls into a labeled menu | Date/range, data time zone, fit/reset and price-scale mode. Expansion uses local panel state. Empty data, partial range and expiry use explicit text. |
| Advanced Chart Grid | Existing Grid route with compact per-tile symbol/interval; focused chart acts as the command target | Keep eight active charts maximum, two concurrent new Grid history requests, independent tile state, maximize, pagination, cache reuse and existing cancellation. |
| Dialogs and overflow | Menus anchored to triggers; modal settings centered within app window | Prevent clipping, trap focus in modal dialogs, Escape closes the innermost active surface, and focus returns to the triggering control. Confirm destructive workspace actions using the current undo and confirmation behavior. |

Workspace modes and analysis panels use explicit text. Icons use the existing licensed project dependencies and GMT-specific labels, geometry and focus states. Use an original charcoal-blue palette such as workspace `#101722`, rails `#182331`, primary text `#E4EDF7`, focus `#78A9EA`, positive `#24BCAA` and negative `#E8798C`. Preserve the current light theme with equivalent contrast, selected states with shape or text cues, and readable prices at 100% and 200% scaling. Treat sizes and colors as proposals subject to screenshots and keyboard acceptance. [License inventory](LICENSE-AUDIT.md)

## Core interactions and state

- Search preserves canonical provider identity, distinguishes Hyperliquid spot/perpetual from Yahoo instruments and shows exchange/source alongside the symbol. Escape restores focus, Enter selects a row and duplicate symbols remain distinguishable. Limit categories to the supported catalogue.
- Settings open against a snapshot of the active target. Preview scope, explicit apply and cancel semantics must be consistent with the existing persistence model. Theme, target, settings and panel changes must avoid unrelated provider requests.
- Pointer interactions support pan, time/price scaling, inspection and measurement. Use explicit drawing mode and edit focus. Keyboard shortcuts respect open input fields and native menu conflicts. Keep measure values and units in an accessible representation.
- Inspectors present persistent watchlist sections, scanner presets, alerts and visible studies with meaningful pending/offline/empty status. Local alerts retain current rule and native-notification lifecycle.
- Replay uses existing recorded candle data with deterministic prefix calculation. A future depth layer needs its own documented coverage and remains hidden when an instrument or stored window has no supported depth.
- Use separate display names and navigation for a market-wide return heatmap and a price/time liquidity layer. Each shows metric, source and time-basis. Preserve missing intervals and disconnected or stale states.
- Persist through existing workspace models, stable instrument and drawing IDs, and validated schemas. Load old profiles without manual resave. On modal dismissal, chart switching, Grid navigation and teardown, release subscriptions and cancel/discard stale responses.
- macOS native fullscreen enter/exit and focus remain known intermittent limitations in rc.8. Maintain existing native assertions. Focus and window transitions also have Windows-native acceptance gates. [Mac release status](MAC_RELEASE_STATUS.md) [Windows pending](WINDOWS_PENDING.md)

## Implementation boundary

The layout specification is a research deliverable. Future implementation should use the [analysis-only policy](ANALYSIS_ONLY_POLICY.md), [provider matrix](PROVIDER_CAPABILITY_MATRIX.md) and [acceptance matrix](UI_ACCEPTANCE_TEST_MATRIX.md) as acceptance criteria.
