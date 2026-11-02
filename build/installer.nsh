; Register Recordly in Explorer's "Open with" list for videos.
; Uses OpenWithProgids only, so the user's default player is never changed.
!macro RecordlyOpenWith EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Recordly.Video" ""
!macroend

!macro RecordlyOpenWithRemove EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Recordly.Video"
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\Recordly.Video" "" "Recordly Video"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Recordly.Video\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Recordly.Video\shell\open\command" "" '"$appExe" "%1"'
  !insertmacro RecordlyOpenWith "mp4"
  !insertmacro RecordlyOpenWith "mov"
  !insertmacro RecordlyOpenWith "webm"
  !insertmacro RecordlyOpenWith "mkv"
  !insertmacro RecordlyOpenWith "avi"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro RecordlyOpenWithRemove "mp4"
  !insertmacro RecordlyOpenWithRemove "mov"
  !insertmacro RecordlyOpenWithRemove "webm"
  !insertmacro RecordlyOpenWithRemove "mkv"
  !insertmacro RecordlyOpenWithRemove "avi"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Recordly.Video"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
