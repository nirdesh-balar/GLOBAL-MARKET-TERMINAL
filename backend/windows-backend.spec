# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller specification for GLOBAL MARKET TERMINAL Windows x64 backend.
Builds the standalone backend executable into backend/dist-windows/imt-backend/
"""
from PyInstaller.utils.hooks import collect_all, collect_submodules
import os
from pathlib import Path

block_cipher = None

# Collect all data and submodules for dynamic/packaged dependencies
datas = [
    (os.path.abspath('backend/resources/index-verification.json'), 'resources'),
    (os.path.abspath('backend/resources/EQUITY_L.csv'), 'resources'),
    (os.path.abspath('backend/resources/SME_EQUITY_L.csv'), 'resources'),
]
binaries = []
hiddenimports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
]

for pkg in ['yfinance', 'curl_cffi', 'certifi', 'exchange_calendars', 'tzdata', 'websockets']:
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas.extend(pkg_datas)
    binaries.extend(pkg_binaries)
    hiddenimports.extend(pkg_hidden)

hiddenimports.extend(collect_submodules('uvicorn'))

a = Analysis(
    [os.path.abspath('backend/launcher.py')],
    pathex=[os.path.abspath('backend'), os.path.abspath('.')],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='imt-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='x86_64',
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.abspath('desktop/assets/icon.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='imt-backend',
)
