// Kleiner Entwicklungsserver ohne Abhängigkeiten: npm run serve
// Liefert die Seite unter http://127.0.0.1:8080 aus und sendet dabei eine strenge CSP
// (auch ohne Ausnahme für style-Attribute). So fällt sofort auf, wenn etwas gegen
// die Regeln verstößt. Nur für die Entwicklung gedacht.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const HOST = '127.0.0.1';

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-cache',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    const blocked = !file.startsWith(ROOT + sep) || /[\\/](\.|node_modules)/.test(file.slice(ROOT.length));
    if (blocked || !(await stat(file)).isFile()) throw new Error('not found');
    const body = await readFile(file);
    res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden');
  }
}).listen(PORT, HOST, () => {
  console.log(`QR-Codes ohne Ablaufdatum läuft auf http://${HOST}:${PORT}`);
});
