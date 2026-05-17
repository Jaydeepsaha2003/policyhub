Place app icon files here before packaging:

  build/icon.icns          macOS .dmg icon (1024x1024 ICNS)
  build/icon.ico           Windows .exe icon (multi-size ICO)
  build/icon.png           1024x1024 PNG (used for Linux / fallback)
  build/tray-icon.png      16x16 or 22x22 PNG used in the menu bar / system tray
                           (macOS: render as a template image — black on
                           transparent — for proper dark/light handling)

If you ship without these, electron-builder will still produce installers,
but with default icons. The tray icon will be empty until you add tray-icon.png.
