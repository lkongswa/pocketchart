!macro customUnInit
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
    "IMPORTANT: Your PocketChart clinical data (client records, notes, documents) is stored separately and will NOT be deleted.$\r$\n$\r$\nHowever, we strongly recommend creating a backup before uninstalling:$\r$\n$\r$\n  1. Open PocketChart$\r$\n  2. Go to Settings > Backup & Export$\r$\n  3. Click 'Export Database'$\r$\n$\r$\nClick OK to continue uninstalling, or Cancel to go back and create a backup first." \
    IDOK proceed
    Abort
  proceed:
!macroend
