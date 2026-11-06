// Contexto de tempo e de conversa para a Maria.
// Problema que resolve: sem isso a IA recebe o histórico como um chat só e, duas semanas depois,
// responde como se fosse a mesma conversa ("como te falei...", retoma pedido velho, não sabe que dia é).
// Regra: um "atendimento" acaba depois de 12 h sem mensagem. A IA recebe só as mensagens do atendimento atual;
// os anteriores viram um resumo curto com data ("há 15 dias perguntou o preço do clínico e não marcou").

const PAUSA_NOVO_ATENDIMENTO_H = 12;
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Horário de Brasília (UTC-3, sem horário de verão)
const br = (d) => new Date(new Date(d).getTime() - 3 * 3600e3);
const ymd = (d) => br(d).toISOString().slice(0, 10);

function agoraPorExtenso(agora) {
  const b = br(agora);
  const h = b.getUTCHours();
  const periodo = h < 12 ? 'manhã' : h < 18 ? 'tarde' : 'noite';
  return `${DIAS[b.getUTCDay()]}, ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]} de ${b.getUTCFullYear()}, ` +
    `${String(h).padStart(2, '0')}h${String(b.getUTCMinutes()).padStart(2, '0')} (${periodo})`;
}

function haQuanto(agora, antes) {
  const dias = Math.round((Date.parse(ymd(agora)) - Date.parse(ymd(antes))) / 864e5);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias (${DIAS[br(antes).getUTCDay()]})`;
  if (dias < 60) return `há ${Math.round(dias / 7)} semana(s) (${br(antes).toISOString().slice(8, 10)}/${br(antes).toISOString().slice(5, 7)})`;
  return `há ${Math.round(dias / 30)} meses`;
}

// mensagens: [{direcao:'in'|'out', texto, criado_em, origem?}] em ordem de tempo (as mais recentes no fim).
// Corta no último intervalo maior que a pausa: daí para frente é o atendimento atual.
function separarAtendimento(mensagens, agora, pausaH = PAUSA_NOVO_ATENDIMENTO_H) {
  const ms = [...mensagens].sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em));
  let inicio = ms.length;
  let anterior = Date.parse(agora);
  for (let i = ms.length - 1; i >= 0; i--) {
    const t = Date.parse(ms[i].criado_em);
    if (anterior - t > pausaH * 3600e3) break;
    inicio = i; anterior = t;
  }
  return { atual: ms.slice(inicio), antigas: ms.slice(0, inicio) };
}

// Monta o bloco que vai no topo do prompt + o histórico que vai para a IA.
// lead: linha de `leads` (nome, etapa, interesse, especialidade, dor, ultima_objecao, proximo_contato...)
// envioAtivo: se a conversa atual começou por mensagem nossa (confirmação, follow-up), a linha de envios_ativos.
function montarContexto({ agora = new Date(), mensagens = [], lead = {}, envioAtivo = null, agendamentos = [] }) {
  const { atual, antigas } = separarAtendimento(mensagens, agora);
  const linhas = [`HOJE: ${agoraPorExtenso(agora)}. Use isso para "amanhã", "sexta", "semana que vem".`];

  linhas.push(lead.nome ? `PACIENTE: ${lead.nome}${lead.telefone ? ' (' + lead.telefone + ')' : ''}.` : 'PACIENTE: nome ainda não informado.');

  if (!antigas.length) {
    linhas.push('HISTÓRICO: primeiro contato com a clínica. Apresente-se.');
  } else {
    const ultima = antigas[antigas.length - 1].criado_em;
    const resumo = [lead.interesse && `interesse: ${lead.interesse}`, lead.especialidade && `especialidade: ${lead.especialidade}`,
      lead.dor && `contou: ${lead.dor}`, lead.ultima_objecao && `objeção: ${lead.ultima_objecao}`, lead.etapa && `etapa: ${lead.etapa}`]
      .filter(Boolean).join('; ');
    linhas.push(`HISTÓRICO: já conversou com a clínica; última conversa ${haQuanto(agora, ultima)}${resumo ? ' (' + resumo + ')' : ''}. ` +
      'Esta é uma NOVA conversa: cumprimente de novo, não continue o assunto antigo como se fosse agora, ' +
      'não diga "como te falei". Se fizer sentido, retome com naturalidade ("Da última vez você perguntou sobre..."), ' +
      'e confirme se ainda é isso que ele precisa.');
  }

  if (envioAtivo) {
    linhas.push(`COMO COMEÇOU: a clínica mandou a primeira mensagem (${envioAtivo.tipo}) ${haQuanto(agora, envioAtivo.enviado_em || agora)}: "${String(envioAtivo.texto).slice(0, 200)}". ` +
      'O paciente está respondendo a isso.');
  } else if (atual.length) {
    linhas.push(`COMO COMEÇOU: o paciente puxou a conversa ${haQuanto(agora, atual[0].criado_em)} às ${br(atual[0].criado_em).toISOString().slice(11, 16)}.`);
  }

  const futuros = agendamentos.filter((a) => a.data >= ymd(agora));
  if (futuros.length) linhas.push('CONSULTAS MARCADAS: ' + futuros.map((a) => `${a.profissional} em ${a.data} às ${a.hora}`).join('; ') + '.');
  if (lead.proximo_contato) linhas.push(`COMBINADO: ele pediu para ser chamado em ${ymd(lead.proximo_contato)}.`);

  return {
    contexto: linhas.join('\n'),
    historico: atual.slice(-20).map((m) => ({ role: m.direcao === 'in' ? 'user' : 'assistant', content: m.texto || '' }))
      .filter((m) => m.content.trim()), // mensagem vazia trava a IA (problema visto no robô do Espeto em 05/11)
  };
}

module.exports = { montarContexto, separarAtendimento, agoraPorExtenso, haQuanto, PAUSA_NOVO_ATENDIMENTO_H };
