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

async function ler() {
  await garantir();
  const rows = await q('select chave, dados, atualizado_em from robo_base');
  const d = Object.fromEntries(rows.map((r) => [r.chave, r.dados]));
  const ultima = rows.reduce((m, r) => (!m || r.atualizado_em > m ? r.atualizado_em : m), null);
  const k = d.conhecimento, c = d.convenios;
  return { versao: k.versao, atualizado_em: ultima, itens: k.itens, convenios: c.convenios, regra_convenio: c.regra, precos: d.precos, textos_ativos: d.textos_ativos };
}

const txt = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const VALIDA = {
  conhecimento: (d) => Array.isArray(d.itens) && d.itens.every((i) => txt(i.id, 80) && txt(i.tema, 200) && txt(i.texto) && typeof (i.gatilhos ?? '') === 'string'),
  convenios: (d) => Array.isArray(d.convenios) && d.convenios.every((c) => txt(c.nome, 120)) && typeof (d.regra ?? '') === 'string',
  precos: (d) => Array.isArray(d.grupos) && d.grupos.every((g) => txt(g.nome, 120) && Array.isArray(g.itens) && g.itens.every((it) => Array.isArray(it) && txt(it[0], 160) && [it[1], it[2]].every((v) => v === null || (typeof v === 'number' && v >= 0) || typeof v === 'string'))) && Array.isArray(d.regras),
  textos_ativos: (d) => d.tipos && Object.values(d.tipos).every((t) => Array.isArray(t.textos) && t.textos.length > 0 && t.textos.every((x) => txt(x, 1000)))
};

export default rota({
  GET: ler,
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
