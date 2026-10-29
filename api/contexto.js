import { q, rota, HttpError, idValido } from './_lib.js';

const CATS = ['triagem', 'atendimento', 'regras', 'informacoes', 'geral'];
const COLS = 'id, titulo, conteudo, categoria, ativo, ordem, atualizado_em';

function valida(b, parcial) {
  const out = {};
  if (!parcial || b.titulo !== undefined) {
    const t = String(b.titulo || '').trim();
    if (t.length < 2 || t.length > 120) throw new HttpError(400, 'O título precisa ter entre 2 e 120 caracteres.');
    out.titulo = t;
  }
  if (!parcial || b.conteudo !== undefined) {
    const c = String(b.conteudo || '').trim();
    if (!c) throw new HttpError(400, 'Escreva o texto da regra para a Maria.');
    if (c.length > 8000) throw new HttpError(400, 'O texto da regra passou de 8000 caracteres. Divida em duas regras.');
    out.conteudo = c;
  }
  if (!parcial || b.categoria !== undefined) {
    if (!CATS.includes(b.categoria)) throw new HttpError(400, 'Categoria inválida.');
    out.categoria = b.categoria;
  }
  if (b.ativo !== undefined) {
    if (typeof b.ativo !== 'boolean') throw new HttpError(400, 'ativo deve ser verdadeiro ou falso.');
    out.ativo = b.ativo;
  }
  return out;
}

export default rota({
  GET: async () => ({ regras: await q(`select ${COLS} from contexto_ia order by ordem, id`) }),

  POST: async ({ body }) => {
    const v = valida(body, false);
    const r = await q(`insert into contexto_ia(titulo, conteudo, categoria, ativo, ordem)
       values ($1, $2, $3, $4, coalesce((select max(ordem) from contexto_ia), 0) + 1) returning ${COLS}`, [v.titulo, v.conteudo, v.categoria, v.ativo !== false]);
    return [201, { regra: r[0] }];
  },

  PATCH: async ({ query, body }) => {
    const id = idValido(query.id);
    if (body.mover) {
      if (!['up', 'down'].includes(body.mover)) throw new HttpError(400, 'Direção inválida.');
      const todas = await q('select id from contexto_ia order by ordem, id');
      const i = todas.findIndex((x) => x.id === id);
      if (i < 0) throw new HttpError(404, 'Regra não encontrada. Atualize a página.');
      const j = body.mover === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < todas.length) [todas[i], todas[j]] = [todas[j], todas[i]];
      await q('update contexto_ia c set ordem = v.o from (select unnest($1::int[]) as id, unnest($2::int[]) as o) v where c.id = v.id',
        [todas.map((x) => x.id), todas.map((_, k) => k + 1)]);
      return { regras: await q(`select ${COLS} from contexto_ia order by ordem, id`) };
    }
    const v = valida(body, true);
    const keys = Object.keys(v);
    if (!keys.length) throw new HttpError(400, 'Nada para alterar.');
    const r = await q(`update contexto_ia set ${keys.map((k, n) => `${k} = $${n + 1}`).join(', ')}, atualizado_em = now() where id = $${keys.length + 1} returning ${COLS}`, [...keys.map((k) => v[k]), id]);
    if (!r.length) throw new HttpError(404, 'Regra não encontrada. Atualize a página.');
    return { regra: r[0] };
  },

  DELETE: async ({ query }) => {
    const id = idValido(query.id);
    const r = await q('delete from contexto_ia where id = $1 returning id', [id]);
    if (!r.length) throw new HttpError(404, 'Regra não encontrada. Atualize a página.');
    return { ok: true };
  }
});
