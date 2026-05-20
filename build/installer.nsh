; PolicyHub custom NSIS install script.
;
; 1. Forcibly kill any running PolicyHub process before the installer's
;    "check app is running" step. This avoids the "PolicyHub cannot be closed"
;    dialog when the user has the tray app running and tries to install/update.
; 2. Wipe the previous user-data folder before installing the new version, so
;    every reinstall starts with a fresh SQLite database.

; Runs *before* electron-builder's checkAppRunning step, so the app is gone by
; the time it checks.
!macro customCheckAppRunning
  DetailPrint "Stopping any running PolicyHub process..."
  nsExec::Exec 'taskkill /F /IM "PolicyHub.exe" /T'
  nsExec::Exec 'taskkill /F /IM "${PRODUCT_FILENAME}.exe" /T'
  Sleep 1500
!macroend

!macro customInstall
  DetailPrint "Removing previous PolicyHub data folder (if any)..."
  ; %APPDATA% on Windows = $APPDATA in NSIS.
  ; This deletes the SQLite database, attachments, settings, everything.
  RMDir /r "$APPDATA\PolicyHub"
!macroend

!macro customUnInstall
  ; Also wipe data on uninstall so leftover SQLite files don't linger.
  RMDir /r "$APPDATA\PolicyHub"
!macroend
