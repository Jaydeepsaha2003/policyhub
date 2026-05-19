; PolicyHub custom NSIS install script.
; Wipes the previous user-data folder before installing the new version, so
; every reinstall starts with a fresh SQLite database. Combine with electron-
; builder's default uninstall flow (which removes the program files) for a
; complete clean upgrade.

!macro customInstall
  ; Tell the user what's about to happen.
  DetailPrint "Removing previous PolicyHub data folder (if any)..."

  ; %APPDATA% on Windows = $APPDATA in NSIS.
  ; This deletes the SQLite database, attachments, settings, everything.
  RMDir /r "$APPDATA\PolicyHub"
!macroend

!macro customUnInstall
  ; Also wipe data on uninstall so leftover SQLite files don't linger.
  RMDir /r "$APPDATA\PolicyHub"
!macroend
