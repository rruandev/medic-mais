import { q, rota } from './_lib.js';

/** Leve de propósito: o painel consulta a cada 5s para avisar a recepção (pedido de humano e mensagem nova de paciente). */
export default rota({
  GET: async () => {
    const [humano, ultima] = await Promise.all([
      q(`select id, telefone, nome, motivo_humano, etapa, atualizado_em from leads where precisa_humano order by atualizado_em desc limit 50`),
      q(`select m.id, m.telefone, l.nome from mensagens m left join leads l on l.telefone = m.telefone where m.direcao = 'in' order by m.id desc limit 1`)
    ]);
    return { humano, ultima_in: ultima[0] || null };
  }
});
