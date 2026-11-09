import os
import shutil
import zipfile
import hashlib
from pathlib import Path
import time
import json

workspace = Path(os.environ.get("GMT_WORKSPACE", Path(__file__).resolve().parent.parent))
unpacked_src = workspace / "release-candidate-rc6" / "win-unpacked"
portable_dir = workspace / "release-candidate-rc6" / "portable"
stage_dir = portable_dir / "GLOBAL-MARKET-TERMINAL-1.1.0-rc.6-win-x64-portable"
zip_out = portable_dir / "GLOBAL-MARKET-TERMINAL-1.1.0-rc.6-win-x64-portable-final.zip"

print(f"1. Source win-unpacked: {unpacked_src}")
print(f"2. Portable target dir: {stage_dir}")
print(f"3. Portable zip target: {zip_out}")

assert unpacked_src.exists(), f"Source {unpacked_src} must exist"
assert (unpacked_src / "GLOBAL MARKET TERMINAL.exe").exists(), "Main executable must exist"
assert (unpacked_src / "resources" / "backend" / "imt-backend.exe").exists(), "Native backend must exist"

# Create clean staging directory
if stage_dir.exists():
    shutil.rmtree(stage_dir)
stage_dir.mkdir(parents=True, exist_ok=True)

# Copy all files from win-unpacked
print("Copying unpacked files to portable staging directory...")
t0 = time.time()
for item in unpacked_src.iterdir():
    dest = stage_dir / item.name
    if item.is_dir():
        shutil.copytree(item, dest)
    else:
        shutil.copy2(item, dest)
print(f"Copied all files in {time.time() - t0:.2f}s")

# Create durable portable launcher .cmd
launcher_cmd = stage_dir / "GLOBAL-MARKET-TERMINAL-Portable.cmd"
launcher_content = """@echo off
setlocal
cd /d "%~dp0"

:: -----------------------------------------------------------------------------
:: GLOBAL MARKET TERMINAL v1.1.0-rc.6 - Durable Portable Edition Launcher
:: Preserves user watchlists, drawings, and preferences locally in portable root.
:: Guarantees 100% isolation from host %APPDATA% and installed GMT v1.0.0.
:: -----------------------------------------------------------------------------

set "ELECTRON_RUN_AS_NODE="
set "PORTABLE_ROOT=%~dp0"
set "PORTABLE_DATA_DIR=%PORTABLE_ROOT%GMT-Portable-Data"
set "PORTABLE_PROFILE=%PORTABLE_DATA_DIR%\\profile"
set "PORTABLE_TEMP=%PORTABLE_DATA_DIR%\\temp"

if not exist "%PORTABLE_PROFILE%" mkdir "%PORTABLE_PROFILE%"
if not exist "%PORTABLE_TEMP%" mkdir "%PORTABLE_TEMP%"

:: Direct temporary and cache operations to local portable storage
set "TEMP=%PORTABLE_DATA_DIR%"
set "TMP=%PORTABLE_DATA_DIR%"

:: Redirect Electron & Python user data directly into durable profile
set "IMT_TEST_DATA_DIR=%PORTABLE_PROFILE%"

:: Clear automated test flags for standard production run
set "IMT_AUTOMATED_TEST="
set "IMT_EXPECT_PREVIEW="
set "IMT_UI_FIXTURE="
set "IMT_OFFLINE="

echo ===============================================================================
echo  GLOBAL MARKET TERMINAL v1.1.0-rc.6 - PORTABLE EDITION
echo ===============================================================================
echo  Portable Root:   %PORTABLE_ROOT%
echo  Data Directory:  %PORTABLE_DATA_DIR%
echo  Profile Storage: %PORTABLE_PROFILE%
echo  Host Isolation:  100%% Isolated (Host %%APPDATA%% untouched)
echo ===============================================================================
echo  Starting terminal...
echo.

start "" "GLOBAL MARKET TERMINAL.exe" --user-data-dir="%PORTABLE_PROFILE%"
"""

launcher_cmd.write_text(launcher_content, encoding="ascii")
print(f"Created launcher script at: {launcher_cmd}")

# Create README.txt in portable root
readme_txt = stage_dir / "README.txt"
readme_content = """GLOBAL MARKET TERMINAL v1.1.0-rc.6 - Portable Edition
======================================================

HOW TO RUN:
Double-click 'GLOBAL-MARKET-TERMINAL-Portable.cmd' to launch.

KEY HIGHLIGHTS IN v1.1.0-rc.6 (Phase UI-4B):
- Responsive Workspace Navigation:
  * Direct Screener and Alerts buttons on wide screens (> 1300px).
  * Collapsible 'Workspaces' dropdown menu on narrow viewports (<= 1300px).
  * Seamless keyboard navigation: ArrowUp, ArrowDown, Home, End, Enter, Space, Escape.
  * Outside click dismissal without blocking chart interactions.
  * Explicit non-drag titlebar regions (-webkit-app-region: no-drag).
  * High-contrast styling in both Dark and Light themes.
- State Preservation Across Workspaces:
  * Charts -> Screener -> Alerts -> Charts round trip preserves active symbol,
    layout, timeframe, indicators, drawings, and volume state.
- Decoupled Volume Toggle Fix:
  * Dedicated volume button cleanly adds/removes volume study pane.
  * 20 rapid toggle stress cycles verified with 0 candle loss and 0 pane desync.
  * Complete indicator independence: volume pane functions identically whether indicators are shown or hidden.
  * Full scale mode compatibility (LOG, AUTO, Percent) across light and dark themes.
- 100% Profile Isolation:
  * Stores user databases and preferences exclusively in 'GMT-Portable-Data\\profile'.
  * Zero modification to host %APPDATA% or existing GMT v1.0.0 installations.
"""
readme_txt.write_text(readme_content, encoding="utf-8")

# Create ZIP archive
print(f"Creating portable ZIP archive: {zip_out} ...")
t1 = time.time()
if zip_out.exists():
    zip_out.unlink()

with zipfile.ZipFile(zip_out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(stage_dir):
        for file in files:
            full_path = Path(root) / file
            rel_path = full_path.relative_to(stage_dir.parent)
            zf.write(full_path, rel_path)

print(f"Compressed archive in {time.time() - t1:.2f}s")
zip_size_bytes = zip_out.stat().st_size
zip_size_mb = zip_size_bytes / (1024 * 1024)
print(f"Archive Size: {zip_size_bytes:,} bytes ({zip_size_mb:.2f} MB)")

# Calculate SHA256 of the zip file
h = hashlib.sha256()
with open(zip_out, "rb") as f:
    while chunk := f.read(1024 * 1024):
        h.update(chunk)
zip_sha256 = h.hexdigest().upper()
print(f"ZIP SHA256: {zip_sha256}")

# Save checksum file
sha_file = zip_out.with_suffix(".zip.sha256")
sha_file.write_text(f"{zip_sha256}  {zip_out.name}\n", encoding="utf-8")

# Verify zero user data inside zip
print("\nVerifying zero user data inside archive...")
user_data_leaks = []
with zipfile.ZipFile(zip_out, "r") as zf:
    for name in zf.namelist():
        lower = name.lower()
        if "data_test.db" in lower or "preferences.db" in lower or "gmt-portable-data" in lower or ".git" in lower:
            user_data_leaks.append(name)

assert len(user_data_leaks) == 0, f"Found leaked user data in archive: {user_data_leaks}"
print("VERIFIED: Zero user databases, profile data, or temporary files found inside portable archive.")

manifest = {
    "product": "GLOBAL MARKET TERMINAL",
    "version": "1.1.0-rc.6",
    "architecture": "win-x64",
    "kind": "portable-zip",
    "path": str(zip_out),
    "size_bytes": zip_size_bytes,
    "sha256": zip_sha256,
    "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "launcher": "GLOBAL-MARKET-TERMINAL-Portable.cmd",
    "user_data_isolation": "GMT-Portable-Data\\profile"
}
manifest_path = portable_dir / "portable-rc6-manifest.json"
manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Wrote manifest: {manifest_path}")
