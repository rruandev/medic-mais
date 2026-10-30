import { q, rota, hojeSP, ETAPAS, COLS_AG, FROM_AG } from './_lib.js';
import { sigmaAtivo, agendaSigma, ATIVO } from './_sigma.js';

export default rota({
  GET: async () => {
    const hoje = await hojeSP();
    const [kpi, funil, prox7, porServico, feed, humano, proximas, servicos, profs, doDia, semana] = await Promise.all([
      q(`with h as (select (now() at time zone 'America/Sao_Paulo')::date d)
         select
          (select count(distinct telefone)::int from mensagens, h where (criado_em at time zone 'America/Sao_Paulo')::date = h.d) as conversas_hoje,
          (select count(*)::int from agendamentos, h where data = h.d and status not in ('cancelado','faltou')) as agendados_hoje,
          (select count(*)::int from agendamentos, h where data >= date_trunc('week', h.d)::date and data < date_trunc('week', h.d)::date + 7 and status not in ('cancelado','faltou')) as consultas_semana,
          (select count(*)::int from leads) as total_leads,
          (select count(distinct lead_id)::int from agendamentos where lead_id is not null and status <> 'cancelado') as leads_agendados,
          (select count(*)::int from leads where precisa_humano) as humano_aberto,
          (select count(*)::int from leads, h where (criado_em at time zone 'America/Sao_Paulo')::date = h.d) as leads_novos_hoje`),
      q(`select etapa, count(*)::int n from leads group by etapa`),
      q(`with h as (select (now() at time zone 'America/Sao_Paulo')::date d)
         select to_char(g.dia,'YYYY-MM-DD') dia, count(a.id)::int n
         from h, generate_series(h.d, h.d + 6, interval '1 day') as g(dia)
         left join agendamentos a on a.data = g.dia::date and a.status not in ('cancelado','faltou')
         group by g.dia order by g.dia`),
      q(`select coalesce(s.nome, a.servico, 'Sem serviço') nome, a.servico chave, count(*)::int n
         from agendamentos a left join servicos s on s.chave = a.servico
         where a.status not in ('cancelado','faltou') group by 1,2 order by n desc`),
      q(`select m.id, m.telefone, m.direcao, case when m.direcao = 'in' then 'paciente' else coalesce(m.origem, 'ia') end as origem, m.midia_tipo, m.midia_arquivo, m.texto, m.criado_em, l.nome,
           (select p.titulo || ' ' || p.nome from agendamentos a join profissionais p on p.id = a.profissional_id
             where a.telefone = m.telefone and a.status in ('agendado','confirmado')
               and a.data >= (now() at time zone 'America/Sao_Paulo')::date
             order by a.data, a.hora limit 1) as medico
         from mensagens m left join leads l on l.telefone = m.telefone
         order by m.id desc limit 12`),
      q(`select id, nome, telefone, motivo_humano, etapa, atualizado_em from leads where precisa_humano order by atualizado_em desc limit 6`),
      q(`with h as (select (now() at time zone 'America/Sao_Paulo')::date d)
         select ${COLS_AG} ${FROM_AG}, h
         where a.data = h.d and a.status not in ('cancelado','faltou') order by a.hora limit 8`),
      q(`select chave, nome, duracao_min, capacidade from servicos order by nome`),
      q(`select p.id, p.titulo, p.nome, p.especialidade, p.servico, p.cor, s.duracao_min, s.capacidade, s.dias_semana,
          to_char(s.inicio,'HH24:MI') inicio, to_char(s.fim,'HH24:MI') fim from profissionais p left join servicos s on s.chave = p.servico
          where p.ativo order by p.id`),
      q(`with h as (select (now() at time zone 'America/Sao_Paulo')::date d)
         select a.id, a.nome, a.status, a.profissional_id, a.servico, to_char(a.hora,'HH24:MI') hora, coalesce(s.duracao_min,30) duracao_min
         from agendamentos a left join servicos s on s.chave = a.servico, h
         where a.data = h.d and a.status not in ('cancelado','faltou') order by a.hora`),
      q(`with h as (select (now() at time zone 'America/Sao_Paulo')::date d)
         select a.profissional_id, count(*)::int n from agendamentos a, h
         where a.data >= date_trunc('week', h.d)::date and a.data < date_trunc('week', h.d)::date + 7
           and a.status not in ('cancelado','faltou') group by 1`)
    ]);
    const k = kpi[0];
    const conv = k.total_leads ? Math.round((k.leads_agendados / k.total_leads) * 100) : 0;
    const dow = new Date(hoje.d + 'T12:00:00Z').getUTCDay(), iso = dow === 0 ? 7 : dow;
    const toMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
    const profissionais_hoje = profs.map((p) => {
      const meus = doDia.filter((a) => (a.profissional_id ? a.profissional_id === p.id : a.servico === p.servico));
      let fim = p.fim ? toMin(p.fim) : 0; if (iso === 6) fim = Math.min(fim, 720);
      const expediente = p.dias_semana && p.dias_semana.includes(iso) ? Math.max(0, fim - toMin(p.inicio)) : 0;
      const ocupado = meus.reduce((t, a) => t + a.duracao_min, 0);
      const agora = toMin(hoje.h);
      const prox = meus.find((a) => toMin(a.hora) + a.duracao_min > agora && a.status !== 'atendido');
      return { id: p.id, titulo: p.titulo, nome: p.nome, especialidade: p.especialidade, cor: p.cor, servico: p.servico,
        consultas: meus.length, atendidas: meus.filter((a) => a.status === 'atendido').length,
        expediente_min: expediente, ocupado_min: ocupado, ocupacao: expediente ? Math.min(100, Math.round((p.capacidade > 1 ? ocupado / p.capacidade : ocupado) / expediente * 100)) : 0,
        inicio: p.inicio, fim: p.fim, atende_hoje: expediente > 0,
        proxima: prox ? { hora: prox.hora, nome: prox.nome } : null };
    });
    const mapaSemana = Object.fromEntries(semana.map((r) => [r.profissional_id, r.n]));
    const por_profissional = profs.map((p) => ({ id: p.id, titulo: p.titulo, nome: p.nome, especialidade: p.especialidade, cor: p.cor, n: mapaSemana[p.id] || 0 }));
    const mapaFunil = Object.fromEntries(funil.map((f) => [f.etapa, f.n]));
    const out = {
      hoje: hoje.d, agora: hoje.h,
      kpis: {
        conversas_hoje: k.conversas_hoje, agendados_hoje: k.agendados_hoje, consultas_semana: k.consultas_semana,
        taxa_conversao: conv, total_leads: k.total_leads, leads_agendados: k.leads_agendados,
        humano_aberto: k.humano_aberto, leads_novos_hoje: k.leads_novos_hoje
      },
      funil: ETAPAS.map((e) => ({ etapa: e, n: mapaFunil[e] || 0 })),
      proximos7: prox7,
      por_servico: porServico,
      feed, humano, proximas, servicos, profissionais_hoje, por_profissional
    };
    if (sigmaAtivo()) {
      let sg;
      try { sg = await resumoSigma(hoje); } catch (e) {
        // sem o Sigma, não mostra agenda inventada: zera os blocos de agenda e avisa
        sg = { agendados_hoje: 0, consultas_semana: 0, proximas: [], profissionais_hoje: [], por_profissional: [], proximos7: out.proximos7.map((d) => ({ dia: d.dia, n: 0 })) };
        out.sigma_erro = e.message || 'Não consegui ler a agenda do Sigma.';
      }
      out.kpis.agendados_hoje = sg.agendados_hoje; out.kpis.consultas_semana = sg.consultas_semana;
      Object.assign(out, { fonte: 'sigma', proximos7: sg.proximos7, proximas: sg.proximas, profissionais_hoje: sg.profissionais_hoje, por_profissional: sg.por_profissional });
    }
    return out;
  }
});

const addDias = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const toMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const fmtMin = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

/** Blocos de agenda do resumo vindos do Sigma (agenda real). Conversas, funil e conversão seguem do Neon (o robô). */
async function resumoSigma(hoje) {
  const dow = new Date(hoje.d + 'T12:00:00Z').getUTCDay();
  const seg = addDias(hoje.d, -((dow + 6) % 7)), dom = addDias(seg, 6);
  const ate = addDias(hoje.d, 6) > dom ? addDias(hoje.d, 6) : dom;
  const { profissionais, agendamentos, horarios } = await agendaSigma(seg < hoje.d ? seg : hoje.d, ate);
  const ativos = agendamentos.filter((a) => ATIVO(a.status));
  const doDia = ativos.filter((a) => a.data === hoje.d);
  const agora = toMin(hoje.h);
  const profissionais_hoje = profissionais.map((p) => {
    const meus = doDia.filter((a) => a.profissional.id === p.id);
    const slots = horarios.filter((h) => h.profissional_id === p.id && h.data === hoje.d && h.situacao !== 'bloqueado' && h.situacao !== 'cancelado' && h.situacao !== 'faltou');
    const expediente = slots.reduce((t, h) => t + h.duracao_min, 0);
    const ocupado = meus.reduce((t, a) => t + a.duracao_min, 0);
    const prox = meus.find((a) => toMin(a.hora) + a.duracao_min > agora && a.status !== 'atendido');
    return { id: p.id, titulo: p.titulo, nome: p.nome, especialidade: p.especialidade, cor: p.cor, servico: p.servico,
      consultas: meus.length, atendidas: meus.filter((a) => a.status === 'atendido').length,
      expediente_min: expediente, ocupado_min: ocupado, ocupacao: expediente ? Math.min(100, Math.round(ocupado / expediente * 100)) : 0,
      inicio: slots.length ? slots[0].hora : null, fim: slots.length ? fmtMin(toMin(slots[slots.length - 1].hora) + slots[slots.length - 1].duracao_min) : null,
      atende_hoje: slots.length > 0, proxima: prox ? { hora: prox.hora, nome: prox.nome } : null };
  });
  const semana = ativos.filter((a) => a.data >= seg && a.data <= dom);
  return {
    agendados_hoje: doDia.length,
    proximos7: Array.from({ length: 7 }, (_, i) => { const d = addDias(hoje.d, i); return { dia: d, n: ativos.filter((a) => a.data === d).length }; }),
    proximas: doDia.slice(0, 8),
    profissionais_hoje,
    por_profissional: profissionais.map((p) => ({ id: p.id, titulo: p.titulo, nome: p.nome, especialidade: p.especialidade, cor: p.cor, n: semana.filter((a) => a.profissional.id === p.id).length })),
    consultas_semana: semana.length
  };
}
