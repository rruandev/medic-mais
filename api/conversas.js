import { q, rota, HttpError } from './_lib.js';

export default rota({
  GET: async ({ query }) => {
    const tel = query.telefone;
    if (tel !== undefined) {
      const t = String(tel).replace(/\D/g, '');
      if (!/^\d{10,15}$/.test(t)) throw new HttpError(400, 'Telefone inválido.');
      const [mensagens, lead] = await Promise.all([
        q(`select id, direcao, origem, midia_tipo, midia_arquivo, texto, criado_em from (
             select id, direcao, case when direcao = 'in' then 'paciente' else coalesce(origem, 'ia') end as origem, midia_tipo, midia_arquivo, texto, criado_em from mensagens where telefone = $1 order by id desc limit 300
           ) x order by id asc`, [t]),
        q(`select id, telefone, nome, etapa, interesse, precisa_humano, motivo_humano, ultima_mensagem, atualizado_em from leads where telefone = $1`, [t])
      ]);
      return { telefone: t, lead: lead[0] || null, mensagens };
    }
    // lista: uma linha por telefone (última mensagem). Leads sem histórico gravado entram com a última mensagem do cadastro.
    const conversas = await q(
      `with ult as (
         select distinct on (telefone) telefone, direcao, case when direcao = 'in' then 'paciente' else coalesce(origem, 'ia') end as origem, midia_tipo, texto, criado_em, id
         from mensagens order by telefone, id desc
       ), tot as (select telefone, count(*)::int n from mensagens group by telefone),
       base as (
         select u.telefone, u.texto, u.direcao, u.origem, u.midia_tipo, u.criado_em, t.n, false as sem_historico from ult u join tot t using (telefone)
         union all
         select l.telefone, l.ultima_mensagem, 'in', 'paciente', null::text, l.atualizado_em, 0, true from leads l
         where not exists (select 1 from mensagens m where m.telefone = l.telefone)
       )
       select b.telefone, b.texto as ultima_texto, b.direcao as ultima_direcao, b.origem as ultima_origem, b.midia_tipo as ultima_midia_tipo, b.criado_em as ultima_em, b.n as total, b.sem_historico,
              l.id as lead_id, l.nome, l.etapa, l.interesse, l.precisa_humano, l.motivo_humano
       from base b left join leads l on l.telefone = b.telefone
       order by l.precisa_humano desc nulls last, b.criado_em desc nulls last limit 300`);
    return { conversas };
  }
});
