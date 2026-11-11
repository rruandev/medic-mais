/* Servidor próprio do painel (VPS Hostinger). Sem framework: serve os arquivos estáticos
   e executa os handlers de api/*.js exatamente como na Vercel. Porta: PORT (padrão 3000). */
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const PUBLICOS = new Set(['index.html', 'app.js', 'style.css']);

const rotas = {};
for (const f of await readdir(join(RAIZ, 'api'))) {
  if (!f.endsWith('.js') || f.startsWith('_')) continue;
  rotas[f.slice(0, -3)] = (await import(pathToFileURL(join(RAIZ, 'api', f)).href)).default;
}

async function corpo(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const partes = [];
  let total = 0;
  for await (const c of req) { total += c.length; if (total > 5e6) throw new Error('corpo grande demais'); partes.push(c); }
  const txt = Buffer.concat(partes).toString('utf8');
  req.body = (req.headers['content-type'] || '').includes('json') ? txt : txt;
}

http.createServer(async (req, res) => {
  try {
    let { pathname } = new URL(req.url, 'http://x');
    if (pathname.startsWith('/api/')) {
      const h = rotas[pathname.slice(5).replace(/\/$/, '')];
      if (!h) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); return res.end('{"erro":"Rota não encontrada."}'); }
      await corpo(req);
      return h(req, res);
    }
    if (pathname === '/app') { res.statusCode = 302; res.setHeader('Location', '/app/'); return res.end(); }
    if (pathname.startsWith('/app/')) pathname = pathname.slice(4);
    if (pathname === '/') pathname = '/index.html';
    const rel = normalize(pathname).replace(/^[/\\]+/, '');
    const ok = PUBLICOS.has(rel) || rel.startsWith('img/');
    if (!ok || rel.includes('..')) { res.statusCode = 404; return res.end('Não encontrado'); }
    const buf = await readFile(join(RAIZ, rel));
    res.setHeader('Content-Type', TIPOS[extname(rel)] || 'application/octet-stream');
    res.setHeader('Cache-Control', rel === 'index.html' ? 'no-cache' : 'public, max-age=300');
    res.end(buf);
  } catch (e) {
    if (e.code === 'ENOENT') { res.statusCode = 404; return res.end('Não encontrado'); }
    console.error('erro', e && e.message);
    res.statusCode = 500; res.end('Erro interno');
  }
}).listen(Number(process.env.PORT) || 3000, () => console.log('painel no ar'));
