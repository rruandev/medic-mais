import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { q, rota, HttpError } from './_lib.js';

/* Treinamento da Maria, editável no painel. Fica no Neon (tabela robo_base, uma linha por parte);
   o n8n lê a mesma tabela. Na primeira vez a tabela é criada e preenchida com robo/base/*.json. */
const ARQ = { conhecimento: 'conhecimento.json', convenios: 'convenios.json', precos: 'precos.json', textos_ativos: 'textos-ativos.json' };
const arquivo = (c) => JSON.parse(readFileSync(join(process.cwd(), 'robo', 'base', ARQ[c]), 'utf8'));

async function garantir() {
  await q(`create table if not exists robo_base (chave text primary key, dados jsonb not null, atualizado_em timestamptz not null default now(), atualizado_por text)`);
  const tem = new Set((await q('select chave from robo_base')).map((r) => r.chave));
  for (const c of Object.keys(ARQ)) if (!tem.has(c)) await q('insert into robo_base (chave, dados, atualizado_por) values ($1, $2::jsonb, $3) on conflict do nothing', [c, JSON.stringify(arquivo(c)), 'documentos da clínica']);
}

/* Documentos originais da clínica (apostila, scripts, tabela, convênios): guardados no banco, nunca apagados pelo painel. */
async function garantirDocs() {
  await q(`create table if not exists robo_documentos (id bigserial primary key, nome text not null, tipo text not null, descricao text,
    fonte text, conteudo bytea not null, tamanho int not null, sha256 text unique, enviado_em timestamptz not null default now(), enviado_por text)`);
}
const listarDocs = async () => { await garantirDocs(); return q('select id, nome, tipo, descricao, fonte, tamanho, enviado_em, enviado_por from robo_documentos order by enviado_em, id'); };

async function ler() {
  await garantir();
  const rows = await q('select chave, dados, atualizado_em from robo_base');
  const d = Object.fromEntries(rows.map((r) => [r.chave, r.dados]));
  const ultima = rows.reduce((m, r) => (!m || r.atualizado_em > m ? r.atualizado_em : m), null);
  const k = d.conhecimento, c = d.convenios;
  return { versao: k.versao, fontes: k.fontes || {}, documentos: await listarDocs(), atualizado_em: ultima, itens: k.itens, convenios: c.convenios, regra_convenio: c.regra, precos: d.precos, textos_ativos: d.textos_ativos };
}

const txt = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const VALIDA = {
  conhecimento: (d) => Array.isArray(d.itens) && d.itens.every((i) => txt(i.id, 80) && txt(i.tema, 200) && txt(i.texto) && typeof (i.gatilhos ?? '') === 'string'),
  convenios: (d) => Array.isArray(d.convenios) && d.convenios.every((c) => txt(c.nome, 120)) && typeof (d.regra ?? '') === 'string',
  precos: (d) => Array.isArray(d.grupos) && d.grupos.every((g) => txt(g.nome, 120) && Array.isArray(g.itens) && g.itens.every((it) => Array.isArray(it) && txt(it[0], 160) && [it[1], it[2]].every((v) => v === null || (typeof v === 'number' && v >= 0) || typeof v === 'string'))) && Array.isArray(d.regras),
  textos_ativos: (d) => d.tipos && Object.values(d.tipos).every((t) => Array.isArray(t.textos) && t.textos.length > 0 && t.textos.every((x) => txt(x, 1000)))
};

export default rota({
  GET: async ({ query }) => {
    if (!query.doc) return ler();
    await garantirDocs();
    const r = (await q("select nome, tipo, encode(conteudo, 'base64') as base64 from robo_documentos where id = $1", [Number(query.doc)]))[0];
    if (!r) throw new HttpError(404, 'Documento não encontrado.');
    return r;
  },
  POST: async ({ body }) => {
    const { nome, tipo, base64, descricao, fonte } = body;
    if (!txt(nome, 200) || !txt(base64, 4_000_000)) throw new HttpError(400, 'Escolha um arquivo de até 3 MB.');
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length || buf.length > 3_000_000) throw new HttpError(400, 'Escolha um arquivo de até 3 MB.');
    const { createHash } = await import('node:crypto');
    const sha = createHash('sha256').update(buf).digest('hex');
    await garantirDocs();
    await q(`insert into robo_documentos (nome, tipo, descricao, fonte, conteudo, tamanho, sha256, enviado_por) values ($1, $2, $3, $4, decode($5, 'base64'), $6, $7, $8)
      on conflict (sha256) do nothing`, [nome.slice(0, 200), String(tipo || 'application/octet-stream').slice(0, 120), descricao ? String(descricao).slice(0, 1000) : null,
      fonte ? String(fonte).slice(0, 60) : null, base64, buf.length, sha, body.enviado_por ? String(body.enviado_por).slice(0, 80) : 'painel']);
    return ler();
  },
  PUT: async ({ body }) => {
    const { chave, dados } = body;
    if (!VALIDA[chave]) throw new HttpError(400, 'Parte do treinamento desconhecida.');
    await garantir();
    const atual = (await q('select dados from robo_base where chave = $1', [chave]))[0].dados;
    const novo = { ...atual, ...dados };
    if (chave === 'conhecimento') novo.versao = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    if (!VALIDA[chave](novo)) throw new HttpError(400, 'Algum campo ficou vazio ou grande demais. Confira e salve de novo.');
    await q("update robo_base set dados = $2::jsonb, atualizado_em = now(), atualizado_por = 'painel' where chave = $1", [chave, JSON.stringify(novo)]);
    return ler();
  }
});
