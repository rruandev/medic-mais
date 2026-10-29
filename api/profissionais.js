import { q, rota } from './_lib.js';

export default rota({
  GET: async () => {
    const profissionais = await q(`select p.id, p.titulo, p.nome, p.especialidade, p.servico, p.cor,
        s.nome as servico_nome, s.duracao_min, s.dias_semana, to_char(s.inicio,'HH24:MI') as inicio, to_char(s.fim,'HH24:MI') as fim
      from profissionais p left join servicos s on s.chave = p.servico where p.ativo order by p.id`);
    return { profissionais };
  }
});
