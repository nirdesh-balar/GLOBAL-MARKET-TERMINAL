{
  "targets": [
    {
      "target_name": "windows-integration",
      "sources": [
        "windows_integration.cc"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "WIN32_LEAN_AND_MEAN",
        "NOMINMAX",
        "WINVER=0x0A00",
        "_WIN32_WINNT=0x0A00"
      ],
      "libraries": [
        "windowsapp.lib"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": [
            "/std:c++17"
          ],
          "RuntimeLibrary": 0
        }
      }
    }
  ]
}
