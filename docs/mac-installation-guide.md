# Global Market Terminal (GMT) — macOS Installation Guide

## Release Candidate R1 (macOS Apple Silicon ARM64)

**File:** `GLOBAL-MARKET-TERMINAL-mac-arm64.dmg`  
**Architecture:** Apple Silicon (M1 / M2 / M3 / M4) native `arm64`  
**Compatibility:** macOS 12 Monterey, macOS 13 Ventura, macOS 14 Sonoma, macOS 15 Sequoia, and newer  
**Build Status:** Local Test / Release Candidate (Ad-hoc Signed)

---

### System Requirements

- **Apple Silicon Mac:** MacBook Air, MacBook Pro, Mac mini, Mac Studio, or iMac powered by Apple Silicon (M1/M2/M3/M4).
- **RAM:** 8 GB minimum (16 GB recommended for 8-pane multi-chart setups).
- **Disk Space:** ~500 MB free space for application bundle and local caching.
- **Dependencies:** **NONE.** GMT is a 100% self-contained standalone desktop package:
  - No Python installation required
  - No Node.js / npm required
  - No Antigravity IDE required
  - No terminal commands required for daily usage

---

### Step-by-Step Installation

1. **Download / Locate the DMG:**
   Locate `GLOBAL-MARKET-TERMINAL-mac-arm64.dmg` in your Downloads or release folder.

2. **Mount the Disk Image:**
   Double-click `GLOBAL-MARKET-TERMINAL-mac-arm64.dmg` to open it in Finder. A window will appear showing:
   - `GLOBAL MARKET TERMINAL.app`
   - A shortcut to `/Applications`

3. **Install the Application:**
   Drag and drop `GLOBAL MARKET TERMINAL.app` into the `Applications` folder shortcut.

4. **Eject the Disk Image:**
   In Finder's sidebar, click the **Eject** icon next to `GLOBAL MARKET TERMINAL`.

---

### First Launch & Gatekeeper Notice

Because this is a **Local Test / Release Candidate** built without an enterprise Apple Developer ID signing certificate, macOS Gatekeeper may present a dialog on first launch stating:

> *"GLOBAL MARKET TERMINAL" can’t be opened because Apple cannot check it for malicious software.*

To open the application:

#### Method A (Fastest — One-Time Step):
1. In Finder, open your **Applications** folder.
2. **Right-click (or Control-click)** on `GLOBAL MARKET TERMINAL.app`.
3. Select **Open** from the context menu.
4. Click **Open** in the confirmation dialog.

#### Method B (Via macOS System Settings):
1. Attempt to open `GLOBAL MARKET TERMINAL.app` normally.
2. Open **System Settings** > **Privacy & Security**.
3. Scroll down to the **Security** section where you will see:
   *"GLOBAL MARKET TERMINAL was blocked from use because it is not from an identified developer."*
4. Click **Open Anyway** and enter your macOS administrator password or Touch ID.

*(This step is only required on the very first launch. Subsequent launches open instantly like any standard Mac app.)*

---

### Key Capabilities in Release Candidate R1

- **Self-Contained Python & C++ Backend:** Boots automatically in under 5 seconds, providing high-performance local financial analytics and historical data caching.
- **TradingView-Style Interaction:**
  - One-Shot drawing tools with automatic cursor deactivation
  - Mouse-wheel price-scale zoom without dragging
  - Stable Logarithmic (`LOG`) and Auto (`AUTO`) price modes
  - Clean OHLC metrics without debug text clutter
  - Refined watchlist selection with left blue vertical accent and zero blue rectangular outline
- **Excel & CSV Export:** Export complete watchlist snapshots to formatted `.xlsx` workbooks synchronized with active chart timeframes.
- **Multi-Chart Layouts:** 1, 2, 4, 6, and 8 simultaneous responsive chart panes with synchronized crosshairs and indicators.
- **Bilingual Themes:** Both Dark and Light themes balanced for optimal contrast, readability, and visual comfort.

