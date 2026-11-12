import { q, rota, HttpError, ETAPAS, idValido, garantePausa } from './_lib.js';

export default rota({
  GET: async () => {
    await garantePausa();
    const leads = await q(
      `select l.id, l.telefone, l.nome, l.etapa, l.interesse, l.ultima_mensagem, l.precisa_humano, l.robo_pausado, l.motivo_humano, l.criado_em, l.atualizado_em,
              (select count(*)::int from agendamentos a where a.lead_id = l.id and a.status in ('agendado','confirmado')) as consultas_ativas
       from leads l order by l.precisa_humano desc, l.atualizado_em desc limit 500`);
    return { leads };
  },

  PATCH: async ({ query, body }) => {
    await garantePausa();
    const id = idValido(query.id);
    const sets = [], params = [];
    if (body.etapa !== undefined) {
      if (!ETAPAS.includes(body.etapa)) throw new HttpError(400, 'Etapa inválida.');
      params.push(body.etapa); sets.push(`etapa = $${params.length}`);
    }
    if (body.precisa_humano !== undefined) {
      if (typeof body.precisa_humano !== 'boolean') throw new HttpError(400, 'precisa_humano deve ser verdadeiro ou falso.');
      params.push(body.precisa_humano); sets.push(`precisa_humano = $${params.length}`);
    }
    if (body.robo_pausado !== undefined) {
      if (typeof body.robo_pausado !== 'boolean') throw new HttpError(400, 'robo_pausado deve ser verdadeiro ou falso.');
      params.push(body.robo_pausado); sets.push(`robo_pausado = $${params.length}`);
    }
    if (!sets.length) throw new HttpError(400, 'Nada para alterar. Envie etapa, precisa_humano e/ou robo_pausado.');
    params.push(id);
    const r = await q(
      `update leads set ${sets.join(', ')}, atualizado_em = now() where id = $${params.length}
       returning id, telefone, nome, etapa, interesse, ultima_mensagem, precisa_humano, robo_pausado, motivo_humano, criado_em, atualizado_em`, params);
    if (!r.length) throw new HttpError(404, 'Contato não encontrado. Atualize a página.');
    return { lead: r[0] };
  }
});
