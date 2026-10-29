import { tokenOk, HttpError, n8nBase } from './_lib.js';

const RE_ARQ = /^[A-Za-z0-9@._-]{1,200}$/;

/** Proxy da mídia do WhatsApp: os arquivos ficam no PC da clínica e o n8n os serve pelo túnel. */
export default async function handler(req, res) {
  const erro = (status, msg) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ erro: msg }));
  };
  try {
    if (!tokenOk(req)) return erro(401, 'Token inválido.');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return erro(405, 'Método não permitido.'); }
    const f = new URL(req.url, 'http://x').searchParams.get('f') || '';
    if (!RE_ARQ.test(f) || f.includes('..')) return erro(400, 'Nome de arquivo inválido.');
    const base = await n8nBase();
    if (!base) return erro(503, 'A mídia ainda não está ligada neste painel (falta o endereço do n8n).');
    let r;
    try {
      r = await fetch(`${base}/webhook/midia?f=${encodeURIComponent(f)}`, { headers: { 'x-painel-token': process.env.PAINEL_TOKEN || '' }, signal: AbortSignal.timeout(15000) });
    } catch { return erro(503, 'Arquivo indisponível: o computador da clínica está offline.'); }
    if (r.status === 404) return erro(404, 'Arquivo não encontrado.');
    if (!r.ok) return erro(503, `Arquivo indisponível (o servidor da clínica respondeu ${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buf);
  } catch (e) {
    if (e instanceof HttpError) return erro(e.status, e.message);
    console.error('Erro na rota midia', e && e.message);
    return erro(500, 'Erro interno ao buscar o arquivo.');
  }
}
