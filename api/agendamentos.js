import { q, rota, PROF_DE_SERVICO, HttpError, STATUS, idValido, normalizaTelefone, validarHorario, agendamentoPorId, dataValida, RE_HORA } from './_lib.js';

/** Mantém a etapa do funil coerente com o que a recepção fez na agenda. */
async function sincronizaEtapa(leadId, status) {
  if (!leadId) return;
  if (status === 'agendado') {
    await q(`update leads set etapa = 'agendado', atualizado_em = now()
             where id = $1 and etapa in ('novo_contato','qualificado','horario_oferecido')`, [leadId]);
  } else if (status === 'confirmado') {
    await q(`update leads set etapa = 'confirmado', atualizado_em = now() where id = $1 and etapa <> 'confirmado'`, [leadId]);
  } else if (status === 'cancelado') {
    // sem outra consulta ativa, o contato volta para "Qualificado" para a recepção retomar a conversa
    await q(`update leads set etapa = 'qualificado', atualizado_em = now()
             where id = $1 and etapa in ('agendado','confirmado')
               and not exists (select 1 from agendamentos where lead_id = $1 and status in ('agendado','confirmado'))`, [leadId]);
  }
}

export default rota({
  POST: async ({ body }) => {
    const { servico, data, hora } = body;
    const status = body.status || 'agendado';
    if (!['agendado', 'confirmado'].includes(status)) throw new HttpError(400, 'Uma consulta nova só pode nascer como "agendado" ou "confirmado".');
    if (!servico) throw new HttpError(400, 'Escolha o serviço.');
    if (!data || !hora) throw new HttpError(400, 'Informe a data e a hora da consulta.');

    let lead = null, nome, telefone;
    if (body.lead_id) {
      lead = (await q('select id, nome, telefone from leads where id = $1', [idValido(body.lead_id)]))[0];
      if (!lead) throw new HttpError(404, 'Contato não encontrado. Atualize a página e tente de novo.');
      nome = (lead.nome || '').trim() || String(body.nome || '').trim();
      telefone = lead.telefone;
      if (!nome) throw new HttpError(400, 'Esse contato não tem nome. Informe o nome do paciente.');
    } else {
      nome = String(body.nome || '').trim();
      if (nome.length < 2) throw new HttpError(400, 'Informe o nome do paciente.');
      if (nome.length > 120) throw new HttpError(400, 'Nome longo demais.');
      telefone = normalizaTelefone(body.telefone);
    }

    const { sv } = await validarHorario({ servico, data, hora, telefone });

    if (!lead) {
      lead = (await q(
        `insert into leads(telefone, nome, etapa, interesse, atualizado_em) values ($1, $2, 'agendado', $3, now())
         on conflict (telefone) do update set nome = coalesce(nullif(leads.nome, ''), excluded.nome), atualizado_em = now()
         returning id, nome, telefone`, [telefone, nome, sv.nome]))[0];
    }

    // INSERT guardado: só grava se a capacidade ainda comporta (fecha a janela de corrida entre duas recepcionistas)
    const ins = await q(
      `with sv as (select duracao_min, capacidade from servicos where chave = $4)
       insert into agendamentos(lead_id, nome, telefone, servico, data, hora, status, profissional_id)
       select $1, $2, $3, $4, $5::date, $6::time, $7, ${PROF_DE_SERVICO.replace('$SV', '$4')} from sv
       where (select count(*) from agendamentos x where x.servico = $4 and x.data = $5::date and x.status not in ('cancelado','faltou')
                and x.hora < ($6::time + make_interval(mins => sv.duracao_min))
                and (x.hora + make_interval(mins => sv.duracao_min)) > $6::time) < sv.capacidade
       returning id`, [lead.id, nome, telefone, servico, data, hora, status]);
    if (!ins.length) throw new HttpError(409, 'Esse horário acabou de ser ocupado por outra pessoa. Escolha outro horário.');

    await sincronizaEtapa(lead.id, status);
    return [201, { agendamento: await agendamentoPorId(ins[0].id) }];
  },

  PATCH: async ({ query, body }) => {
    const id = idValido(query.id);
    const atual = await agendamentoPorId(id);
    if (!atual) throw new HttpError(404, 'Consulta não encontrada. Atualize a página.');

    const novo = {
      status: body.status ?? atual.status,
      servico: body.servico ?? atual.servico,
      data: body.data ?? atual.data,
      hora: body.hora ?? atual.hora
    };
    if (!STATUS.includes(novo.status)) throw new HttpError(400, 'Status inválido.');
    if (body.data !== undefined && !dataValida(body.data)) throw new HttpError(400, 'Data inválida.');
    if (body.hora !== undefined && !RE_HORA.test(body.hora)) throw new HttpError(400, 'Hora inválida.');

    const mudouHorario = novo.servico !== atual.servico || novo.data !== atual.data || novo.hora !== atual.hora;
    const ocupa = !['cancelado', 'faltou'].includes(novo.status);
    const reativando = ocupa && ['cancelado', 'faltou'].includes(atual.status);
    if (!mudouHorario && novo.status === atual.status) return { agendamento: atual, alterado: false };

    if (ocupa && (mudouHorario || reativando)) {
      await validarHorario({ ...novo, ignorarId: id, telefone: atual.telefone });
    }

    const upd = await q(
      `with sv as (select duracao_min, capacidade from servicos where chave = $2)
       update agendamentos a set status = $1, servico = $2, data = $3::date, hora = $4::time,
         profissional_id = case when $2 <> a.servico or a.profissional_id is null then ${PROF_DE_SERVICO.replace('$SV', '$2')} else a.profissional_id end
       where a.id = $5
         and ($6::boolean = false or (select count(*) from agendamentos x where x.id <> a.id and x.servico = $2 and x.data = $3::date
              and x.status not in ('cancelado','faltou')
              and x.hora < ($4::time + make_interval(mins => coalesce((select duracao_min from sv), 30)))
              and (x.hora + make_interval(mins => coalesce((select duracao_min from sv), 30))) > $4::time) < coalesce((select capacidade from sv), 1))
       returning a.id`, [novo.status, novo.servico, novo.data, novo.hora, id, ocupa]);
    if (!upd.length) throw new HttpError(409, 'Esse horário acabou de ser ocupado por outra pessoa. Escolha outro horário.');

    if (novo.status !== atual.status) await sincronizaEtapa(atual.lead_id, novo.status);
    return { agendamento: await agendamentoPorId(id), alterado: true };
  }
});
