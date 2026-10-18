# Testing and native acceptance

Run `backend/.venv/bin/python -m pytest backend/tests -q` on macOS; use `backend/.venv/Scripts/python.exe` on Windows. Run `npm run test:release` and `node scripts/verify-windows.mjs` for numerical/platform and source Electron interaction suites. The JSON output identifies the actual host. Source fixtures are never live-provider or Windows desktop proof.

All GUI suites must run serially on one desktop. Use isolated temporary profiles and the guarded launcher. Never select an older release or normal userData. The exact packaged candidate must be supplied in GMT_MAC_TEST_EXE or GMT_WINDOWS_TEST_EXE. The guard checks package identity and records actual userData before interaction.

macOS: verify/mount DMG read-only, inspect the app/Applications shortcut, copy to a private installation slot, verify arm64 app/backend and strict signing, launch, load real Yahoo and officially discovered Hyperliquid spot/perpetual samples, exercise indicators/drawings/layouts/fullscreen/replay, restart and compare settings. Do not overwrite a normal Applications installation or clear quarantine to bypass Gatekeeper. Ad-hoc local launch is not downloaded Developer ID acceptance.

Windows 11: install visibly without developer tools on PATH; verify executable/backend architecture, shortcut/AUMID, actual userData, real providers/streaming, F11/Escape, native caption controls, CSV/JSON dialogs, DPI/multi-monitor, notification receipt/click, quit/restart and uninstall data preservation. Hosted Windows Server automation is additional evidence, not full Windows 11 acceptance.

For each platform's updater, use two authorized signed versions and a temporary profile. Save watchlists, indicators, drawings and layout in A; detect/download/validate B from the authorized official feed, choose restart, verify B and compare the saved profile. Record actual signatures, source/artifact hashes and screenshots. Mock events do not satisfy this gate. Neither native update path has been accepted in the current candidate.
