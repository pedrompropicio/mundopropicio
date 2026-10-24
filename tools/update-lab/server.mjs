import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const text = file => readFile(file, 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function verifySources() {
  const provenance = JSON.parse(await text(path.join(directory, 'sources.json')));
  for (const [file, expected] of Object.entries(provenance.files)) {
    const actual = hash(await readFile(path.join(root, file)));
    if (actual !== expected) throw new Error(`Source drift: ${file}. Re-evaluate provenance before running.`);
  }
  return provenance;
}

function compile(source, buildId) {
  return stripTypeScriptTypes(source, { mode: 'strip', disableExperimentalWarning: true })
    .replaceAll('__BUILD_ID__', JSON.stringify(buildId))
    .replaceAll('import.meta.env.PROD', 'true')
    .replaceAll('import.meta.env.DEV', 'false');
}

export async function startServer({ port = 0 } = {}) {
  const provenance = await verifySources();
  let revision = 1;
  let origin;
  const server = http.createServer(async (req, res) => {
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
      res.writeHead(403); res.end('Local origin only'); return;
    }
    const url = new URL(req.url, origin);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const send = (body, type = 'text/javascript') => { res.setHeader('Content-Type', `${type}; charset=utf-8`); res.end(body); };
    try {
      if (url.pathname === '/__lab/deploy' && req.method === 'POST') {
        revision += 1; send(JSON.stringify({ buildId: `lab-${revision}` }), 'application/json'); return;
      }
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      const buildId = `lab-${revision}`;
      if (url.pathname === '/version.json') { send(JSON.stringify({ buildId }), 'application/json'); return; }
      if (url.pathname === '/') {
        const mode = url.searchParams.get('mode') === 'proposal' ? 'proposal' : 'baseline';
        send((await text(path.join(directory, 'index.html'))).replace('src="/app.js"', `src="/app.js?mode=${mode}"`), 'text/html'); return;
      }
      if (url.pathname === '/app.js') {
        const mode = url.searchParams.get('mode') === 'proposal' ? 'proposal' : 'baseline';
        send((await text(path.join(directory, 'app.js'))).replace("'/manager.js'", `'/manager.js?mode=${mode}'`).replaceAll('__LAB_BUILD__', buildId)); return;
      }
      if (url.pathname === '/manager.js') {
        const proposal = url.searchParams.get('mode') === 'proposal';
        send(proposal ? await text(path.join(directory, 'candidate-manager.js'))
          : compile(await text(path.join(root, 'src/components/PWAUpdateManager.tsx')), buildId)); return;
      }
      const sources = { '/lib/pwa.js': 'src/lib/pwa.ts', '/lib/versionCheck.js': 'src/lib/versionCheck.ts' };
      if (sources[url.pathname]) { send(compile(await text(path.join(root, sources[url.pathname])), buildId)); return; }
      if (url.pathname === '/sw.js') {
        // Synthetic worker; deliberately no cache, network or external effects.
        send(`const version=${JSON.stringify(buildId)}; self.addEventListener('install',()=>self.skipWaiting()); self.addEventListener('activate',event=>event.waitUntil(self.clients.claim())); self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});`); return;
      }
      const assets = { '/adapters.js': 'text/javascript', '/sw-register.js': 'text/javascript', '/style.css': 'text/css' };
      if (assets[url.pathname]) { send(await text(path.join(directory, url.pathname.slice(1))), assets[url.pathname]); return; }
      res.writeHead(404); res.end('Not in laboratory allowlist');
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin, provenance, close: () => new Promise(resolve => server.close(resolve)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const lab = await startServer({ port: Number(process.env.UPDATE_LAB_PORT || 4179) });
  console.log(`Local-only laboratory: ${lab.origin}`);
  console.log(`Pinned source: ${lab.provenance.commit}`);
}
