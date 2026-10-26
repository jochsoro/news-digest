/**
 * Mini serveur statique pour tester les éditions en local, sans dépendance :
 * sert `out/` sur http://localhost:8787 avec CORS ouvert, comme le ferait le CDN.
 *
 *   npm run digest:serve        (à la racine : npm run digest:serve)
 *   PORT=9000 node src/serve.mjs
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.env.DIGEST_OUT || new URL('../out', import.meta.url).pathname);
const PORT = Number(process.env.PORT || 8787);

const TYPES = { '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8' };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // Pas de sortie du dossier servi.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, rel);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    let st = statSync(file);
    if (st.isDirectory()) { file = join(file, 'index.json'); st = statSync(file); }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Length': st.size });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404 — ${rel}\n(dossier servi : ${ROOT})\n`);
  }
});

server.listen(PORT, () => {
  console.log(`Éditions servies sur http://localhost:${PORT}  (dossier : ${ROOT})`);
  console.log(`Exemple : http://localhost:${PORT}/digests/world/latest.json — Ctrl+C pour arrêter.`);
});
