; PolicyHub custom NSIS install script.
;
; 1. Forcibly kill any running PolicyHub process before the installer's
;    "check app is running" step. This avoids the "PolicyHub cannot be closed"
;    dialog when the user has the tray app running and tries to install/update.
; 2. Wipe the previous user-data folder before installing the new version, so
;    every reinstall starts with a fresh SQLite database.

; Replaces electron-builder's default checkAppRunning entirely. We don't try to
; politely close PolicyHub via a window message (which fails for tray-resident
; apps with no visible window) — we just force-kill every PolicyHub process by
; image name, then sleep, then kill again to catch any restarted children.
!macro customCheckAppRunning
  DetailPrint "Stopping any running PolicyHub process..."

  ; Kill by image name. /F = force, /T = also kill child processes.
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub.exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper.exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper (GPU).exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper (Renderer).exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper (Plugin).exe"'

  Sleep 1200

  ; Second pass — anything that respawned (Electron sometimes restarts helpers).
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub.exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper.exe"'

  ; Belt-and-braces: WMIC kill by name in case taskkill missed something.
  nsExec::Exec 'wmic process where name="PolicyHub.exe" call terminate'

  Sleep 800
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
