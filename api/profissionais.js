import { q, rota } from './_lib.js';
import { sigmaAtivo, agendaSigma } from './_sigma.js';

/* Profissionais do painel. Com o Sigma ligado, a lista vem da agenda real da clínica
   (próximos 30 dias); a tabela do Neon só vale sem Sigma. */
export default rota({
  GET: async () => {
    if (sigmaAtivo()) {
      const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      const fim = new Date(Date.now() - 3 * 3600e3 + 30 * 864e5).toISOString().slice(0, 10);
      const { profissionais } = await agendaSigma(hoje, fim);
      return { fonte: 'sigma', profissionais };
    }
    const profissionais = await q(`select p.id, p.titulo, p.nome, p.especialidade, p.servico, p.cor,
        s.nome as servico_nome, s.duracao_min, s.dias_semana, to_char(s.inicio,'HH24:MI') as inicio, to_char(s.fim,'HH24:MI') as fim
      from profissionais p left join servicos s on s.chave = p.servico where p.ativo order by p.id`);
    return { profissionais };
  }
});
