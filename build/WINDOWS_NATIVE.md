# Windows native integration

`desktop/native/windows` is a Node-API addon built by the locked node-gyp dependency against the exact installed Electron headers. Build on Windows x64 with Visual Studio 2022 C++ tools and the Windows SDK. It uses a static C++ runtime and Windows system APIs; it does not require a separate user-installed development environment.

The Job Object is unnamed and attaches only the PID returned by this app's backend spawn, after checking its direct parent and opened process image against the expected backend (including long-name normalization). KILL_ON_JOB_CLOSE terminates assigned descendants when the app closes its handle or crashes. Graceful shutdown first uses the inherited private stdin pipe; no network shutdown endpoint is added. There is no process-name-wide termination.

Toast permission uses the documented Windows `ToastNotifier.Setting` API for `local.globalmarket.terminal`. An Enabled result is not proof of banner presentation, sound, Focus state or user receipt. Start Menu AppUserModelID is set by NSIS; Electron uses the same identity. Installation, actual toast/cold-click behavior and COM activation must still be verified on a real Windows desktop. Unknown permission is reported honestly and does not become a claimed delivery.

References:
- https://www.electronjs.org/docs/latest/tutorial/notifications
- https://www.electronjs.org/docs/latest/api/notification
- https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotifier.setting
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- https://pyinstaller.org/en/stable/operating-mode.html
