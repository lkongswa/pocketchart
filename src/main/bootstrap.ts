// Runs FIRST — before any module that touches electron-store, the SQLCipher
// DB, or anything else that snapshots `app.getPath('userData')` at import
// time. Must be the very first import in main.ts. Do not add unrelated
// initialization here — it's intentionally minimal so it can stay first.

import { app } from 'electron';
import path from 'path';

// Isolate dev userData so `npm run dev` never reads or writes the installed
// app's encrypted DB.
//   Production install: %APPDATA%/PocketChart
//   Dev:                %APPDATA%/PocketChart-Dev
if (process.env.NODE_ENV === 'development') {
  app.setPath('userData', path.join(app.getPath('appData'), 'PocketChart-Dev'));
}
