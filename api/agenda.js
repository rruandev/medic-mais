import { q, rota, HttpError, dataValida, COLS_AG, FROM_AG } from './_lib.js';
import { sigmaAtivo, agendaSigma, servicosSigma } from './_sigma.js';

export default rota({
  GET: async ({ query }) => {
    const { inicio, fim } = query;
    if (!dataValida(inicio) || !dataValida(fim)) throw new HttpError(400, 'Informe inicio e fim no formato AAAA-MM-DD.');
    if (fim < inicio) throw new HttpError(400, 'A data final é anterior à inicial.');
    const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000;
    if (dias > 62) throw new HttpError(400, 'Período grande demais. Peça no máximo 62 dias.');
    if (sigmaAtivo()) {
      // agenda real da clínica (Sigma), só leitura
      const { profissionais, agendamentos } = await agendaSigma(inicio, fim);
      return { inicio, fim, fonte: 'sigma', agendamentos, servicos: servicosSigma(agendamentos), profissionais };
    }
    const [agendamentos, servicos, profissionais] = await Promise.all([
      q(`select ${COLS_AG}, l.etapa ${FROM_AG} left join leads l on l.id = a.lead_id
         where a.data between $1::date and $2::date order by a.data, a.hora, a.id`, [inicio, fim]),
      q(`select chave, nome, duracao_min, capacidade, dias_semana, to_char(inicio,'HH24:MI') inicio, to_char(fim,'HH24:MI') fim from servicos order by nome`),
      q(`select id, titulo, nome, especialidade, servico, cor from profissionais where ativo order by id`)
    ]);
    return { inicio, fim, agendamentos, servicos, profissionais };
  }
});
