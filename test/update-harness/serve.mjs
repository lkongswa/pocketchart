// Dependency-free static file server with HTTP Range support, for exercising
// the PocketChart auto-updater against locally-hosted, already-signed builds.
//
//   node serve.mjs <dir> [port]
//
// electron-updater (generic provider) fetches `latest.yml` then the installer
// it references from the same base URL, using Range requests — both handled here.
import { createServer } from 'node:http';
import { stat, open } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const dir = process.argv[2];
const port = Number(process.argv[3] || 8080);
if (!dir) {
  console.error('Usage: node serve.mjs <dir> [port]');
  process.exit(1);
}
const root = resolve(dir);
const TYPES = { '.yml': 'text/yaml', '.exe': 'application/octet-stream', '.blockmap': 'application/octet-stream' };

createServer(async (req, res) => {
  let urlPath = '/';
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filePath = normalize(join(root, urlPath));
    if (!filePath.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }

    const st = await stat(filePath);
    const type = TYPES[extname(filePath)] || 'application/octet-stream';
    const range = req.headers.range;
    const fh = await open(filePath);

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (Number.isNaN(end) || end >= st.size) end = st.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': type,
      });
      fh.createReadStream({ start, end }).pipe(res).on('close', () => fh.close());
    } else {
      res.writeHead(200, { 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Content-Type': type });
      fh.createReadStream().pipe(res).on('close', () => fh.close());
    }
    console.log(`${res.statusCode} ${req.method} ${urlPath}`);
  } catch {
    res.writeHead(404).end('not found');
    console.log(`404 ${req.method} ${urlPath}`);
  }
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}  (Ctrl+C to stop)`));
