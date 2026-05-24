; PolicyHub custom NSIS install script.
;
; Goals:
;   1. Force-quit any running PolicyHub before the install touches files —
;      avoids the "PolicyHub cannot be closed" dialog for tray-resident apps.
;   2. PRESERVE the user's data folder (%APPDATA%\PolicyHub) across upgrades
;      and reinstalls. Migrations inside the app handle schema changes
;      idempotently — the installer must never wipe data.
;   3. On a real uninstall the user data is also preserved, in case they
;      reinstall later or want to manually grab their .db file.
;      If they want a clean slate they use Settings → Reset all data inside
;      the app before uninstalling.

; Replaces electron-builder's default checkAppRunning entirely. We just
; force-kill every PolicyHub process by image name, sleep, then kill again to
; catch any restarted children.
!macro customCheckAppRunning
  DetailPrint "Stopping any running PolicyHub process..."

  nsExec::Exec 'taskkill /F /T /IM "PolicyHub.exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper.exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper (GPU).exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper (Renderer).exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper (Plugin).exe"'

  Sleep 1200

  nsExec::Exec 'taskkill /F /T /IM "PolicyHub.exe"'
  nsExec::Exec 'taskkill /F /T /IM "PolicyHub Helper.exe"'
  nsExec::Exec 'wmic process where name="PolicyHub.exe" call terminate'

  Sleep 800
!macroend

; Note: customInstall and customUnInstall macros intentionally left empty so
; we never delete %APPDATA%\PolicyHub. Schema migrations handle upgrades
; in-place; users use Settings → Reset all data to wipe explicitly.
