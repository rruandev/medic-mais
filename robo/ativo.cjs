// Mensagens ativas do robô MedicMais: textos, quem recebe, quando e como ler a resposta.
// Funções puras (sem banco, sem WhatsApp) para o n8n chamar e para testar aqui.

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };
// Saudação pelo horário de Brasília na hora do envio (bom dia / boa tarde / boa noite).
const saud = () => { const h = new Date(Date.now() - 3 * 3600e3).getUTCHours(); return h >= 5 && h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const ola = (n) => (primeiroNome(n) ? `${saud()}, ${primeiroNome(n)}!` : `${saud()}!`);
const dataBR = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}`; };
const diaSemana = (iso) => DIAS[new Date(iso + 'T12:00:00-03:00').getUTCDay()];

const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// Link no 1º aviso só se a política permitir (cfg ativo_boleto_link = 'sempre'). Padrão: sem link; o paciente
// responde e a Fátima manda a 2ª via. Mensagem com link para quem não respondeu é sinal forte de spam para o WhatsApp.
const linkBoleto = (c) => (c.link ? `\n\n${c.link}` : '\n\nSe quiser, é só me responder aqui que eu te mando a segunda via.');
const descBoleto = (c) => (c.descricao ? `, referente a ${c.descricao},` : '');
const descBoletoSemVirgula = (c) => (c.descricao ? `, referente a ${c.descricao}` : '');

// Variações de texto: cada envio sorteia uma (mensagem idêntica em massa aumenta risco de bloqueio).
const TEXTOS = {
  confirmacao: [
    (c) => `${ola(c.nome)} Aqui é a Fátima, do atendimento da MedicMais Sobradinho 💙\nPassando para confirmar sua consulta com ${c.profissional} ${c.quando}, às ${c.hora}.\n\nResponda:\n1 - Confirmo\n2 - Preciso remarcar\n3 - Não vou poder ir`,
    (c) => `${ola(c.nome)} É a Fátima, do atendimento da MedicMais Sobradinho 💙\nSua consulta com ${c.profissional} está marcada para ${c.quando}, às ${c.hora}. Posso confirmar?\n\n1 - Sim, confirmo\n2 - Quero remarcar\n3 - Não poderei ir`,
  ],
  lembrete_dia: [
    (c) => `${ola(c.nome)} Te esperamos hoje às ${c.hora} com ${c.profissional} na MedicMais Sobradinho 💙 Se puder, chegue 10 minutinhos antes.`,
  ],
  falta: [
    (c) => `${ola(c.nome)} Aqui é a Fátima, do atendimento da MedicMais. Sentimos sua falta na consulta de ontem com ${c.profissional}. Está tudo bem? Quer que eu veja um novo horário pra você?`,
  ],
  followup: [ // conversa parou sem agendar (24 h depois)
    (c) => `${ola(c.nome)} Aqui é a Fátima, do atendimento da MedicMais 💙 Ficou alguma dúvida sobre ${c.assunto || 'o atendimento'}? Se quiser, já vejo um horário pra você.`,
    (c) => `${ola(c.nome)} Passando para saber se consigo te ajudar com ${c.assunto || 'o seu atendimento'}. Tenho horários essa semana, prefere manhã ou tarde?`,
  ],
  followup_2: [ // 2ª e última tentativa (72 h depois)
    (c) => `${ola(c.nome)} Não quero te incomodar, é só para não deixar você sem resposta. Quando quiser cuidar ${c.assunto ? 'do(a) ' + c.assunto : 'disso'}, é só me chamar aqui 💙`,
  ],
  pediu_para_chamar: [ // "me chama sexta"
    (c) => `${ola(c.nome)} Combinamos de conversar hoje 😊 Aqui é a Fátima, do atendimento da MedicMais. Vamos ver aquele horário ${c.assunto ? 'para ' + c.assunto : ''}? Prefere manhã ou tarde?`,
  ],
  exames: [ // consulta feita, exames pedidos e não feitos (2 dias depois)
    (c) => `${ola(c.nome)} Aqui é a Fátima, do atendimento da MedicMais 💙 Vi que o(a) ${c.profissional} pediu alguns exames. Quer que eu já deixe sua coleta agendada? A análise é da DASA e a nossa enfermeira tem a mão leve 😉`,
  ],
  retorno: [
    (c) => `${ola(c.nome)} Seus exames já ficaram prontos? Lembrando que você pode voltar para mostrar os resultados ao médico. Quer que eu reserve seu retorno?`,
  ],
  reativacao: [ // paciente que não aparece há meses; sempre com aprovação do Ribeiro e só quem já conversou
    (c) => `${ola(c.nome)} Aqui é a Fátima, do atendimento da MedicMais 💙 Faz um tempinho que não te vemos por aqui e quis saber como você está. Se precisar de consulta, de exame ou de cuidar dos dentes, posso ver um horário pra você.`,
    (c) => `${ola(c.nome)} É a Fátima, da MedicMais Sobradinho. Passando para saber se está tudo bem com você. Quando quiser marcar uma consulta ou um exame, é só me chamar aqui 💙`,
  ],
  boleto_antes: [ // vence amanhã
    (c) => `${ola(c.nome)} Aqui é a Fátima, do atendimento da MedicMais 💙 Passando para avisar que o boleto de ${brl(c.valor)}${descBoleto(c)} vence amanhã, dia ${c.vencimento}.${linkBoleto(c)}\n\nSe você já pagou, pode desconsiderar.`,
    (c) => `${ola(c.nome)} É a Fátima, da MedicMais Sobradinho. Só um lembrete: amanhã, dia ${c.vencimento}, vence o boleto de ${brl(c.valor)}${descBoleto(c)}.${linkBoleto(c)}\n\nSe já estiver pago, desconsidere, tá bom?`,
    (c) => `${ola(c.nome)} Tudo bem? Aqui é a Fátima, da MedicMais 💙 Lembrando que o seu boleto de ${brl(c.valor)}${descBoleto(c)} tem vencimento amanhã (${c.vencimento}).${linkBoleto(c)}\n\nCaso já tenha pago, pode ignorar esta mensagem.`,
  ],
  boleto_vence: [ // vence hoje
    (c) => `${ola(c.nome)} Aqui é a Fátima, da MedicMais. O boleto de ${brl(c.valor)}${descBoleto(c)} vence hoje.${linkBoleto(c)}\n\nSe você já pagou, pode desconsiderar.`,
    (c) => `${ola(c.nome)} É a Fátima, do atendimento da MedicMais 💙 Passando para lembrar que hoje é o vencimento do boleto de ${brl(c.valor)}${descBoleto(c)}.${linkBoleto(c)}\n\nSe já estiver pago, desconsidere.`,
    (c) => `${ola(c.nome)} Tudo bem? Aqui é a Fátima, da MedicMais. Hoje vence o seu boleto de ${brl(c.valor)}${descBoleto(c)}.${linkBoleto(c)}\n\nCaso já tenha pago, pode ignorar esta mensagem.`,
  ],
  boleto_atraso_1: [ // venceu há 1 a 4 dias
    (c) => `${ola(c.nome)} Aqui é a Fátima, do atendimento da MedicMais 💙 O boleto de ${brl(c.valor)}${descBoleto(c)} venceu no dia ${c.vencimento} e ainda não aparece como pago. Às vezes o pagamento demora um dia para cair.${linkBoleto(c)}\n\nSe já pagou, me avise que eu peço para a equipe conferir.`,
    (c) => `${ola(c.nome)} É a Fátima, da MedicMais Sobradinho. Notamos que o boleto de ${brl(c.valor)}${descBoletoSemVirgula(c)}, com vencimento em ${c.vencimento}, ainda está em aberto no nosso sistema.${linkBoleto(c)}\n\nSe você já pagou, me avise que a equipe confere.`,
    (c) => `${ola(c.nome)} Tudo bem? Aqui é a Fátima, da MedicMais 💙 O boleto de ${brl(c.valor)}${descBoleto(c)} que venceu em ${c.vencimento} ainda não consta como pago. Pode ser só a compensação do banco.${linkBoleto(c)}\n\nSe já pagou, é só me avisar.`,
  ],
  boleto_atraso_5: [ // última tentativa automática; depois só a recepção
    (c) => `${ola(c.nome)} Tudo bem? Aqui é a Fátima, da MedicMais. O boleto de ${brl(c.valor)}${descBoleto(c)} que venceu no dia ${c.vencimento} continua em aberto. Se houver algum problema, me conte que eu aviso a nossa equipe para ajudar você.${linkBoleto(c)}`,
    (c) => `${ola(c.nome)} É a Fátima, do atendimento da MedicMais 💙 O boleto de ${brl(c.valor)}${descBoletoSemVirgula(c)}, vencido em ${c.vencimento}, ainda aparece em aberto. Se precisar de ajuda com ele, me fala que eu chamo a equipe.${linkBoleto(c)}`,
    (c) => `${ola(c.nome)} Aqui é a Fátima, da MedicMais Sobradinho. Seu boleto de ${brl(c.valor)}${descBoleto(c)} com vencimento em ${c.vencimento} segue em aberto. Qualquer dificuldade, me conta que a nossa equipe ajuda.${linkBoleto(c)}`,
  ],
};

function montar(tipo, dados, sorteio = Math.random()) {
  const lista = TEXTOS[tipo];
  if (!lista) throw new Error('tipo desconhecido: ' + tipo);
  const c = { ...dados };
  if (c.data && !c.quando) {
    const hoje = c.hoje || new Date().toISOString().slice(0, 10);
    const amanha = new Date(Date.parse(hoje + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
    c.quando = c.data === amanha ? `amanhã (${diaSemana(c.data)}, ${dataBR(c.data)})` : `${diaSemana(c.data)}, ${dataBR(c.data)}`;
  }
  if (c.vencimento_iso && !c.vencimento) c.vencimento = dataBR(c.vencimento_iso);
  const texto = lista[Math.floor(sorteio * lista.length) % lista.length](c);
  const rodape = c.rodape ?? !['confirmacao', 'lembrete_dia'].includes(tipo);
  return texto + (rodape ? '\n\n(Se não quiser receber avisos, responda SAIR.)' : '');
}

// Lê a resposta do paciente a uma confirmação.
function lerResposta(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (/^(sair|parar|pare|stop|nao quero (receber|mensagem)|descadastr)/.test(t)) return 'sair';
  if (/^1\b|^(sim|confirm|ok\b|okay|pode confirmar|confirmado|vou sim|estarei|com certeza|blz|beleza|certo)/.test(t)) return 'confirmar';
  if (/^2\b|remarc|outro (dia|horario)|mudar (o )?horario|trocar (o )?horario|reagend/.test(t)) return 'remarcar';
  if (/^3\b|nao (vou|poderei|consigo|posso)|cancel|desmarc/.test(t)) return 'cancelar';
  return 'conversa'; // qualquer outra coisa vai para a IA normal
}

// Resposta a um aviso de boleto. NÃO usar lerResposta aqui: "não consigo pagar" seria lido como cancelar consulta.
// 'paguei' → recepção confere; 'segunda_via' → reenviar o link guardado; 'negociar' → humano (a Fátima nunca negocia).
function lerRespostaBoleto(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (/^(sair|parar|pare|stop|nao quero (receber|mensagem)|descadastr)/.test(t)) return 'sair';
  if (/desconto|parcel|negoci|prorrog|adiar|mais prazo|nova data|sem condico|nao (tenho|consigo|posso) (como )?pagar|nao tenho dinheiro|dificuldade|acordo|juros|multa/.test(t)) return 'negociar';
  if (/(ja )?(paguei|pago ontem|foi pago|quitei|comprovante|fiz o pagamento)/.test(t)) return 'paguei';
  if (/^(sim|quero|pode( sim)?( mandar)?|manda|mande|por favor)\b/.test(t)) return 'segunda_via'; // respondeu ao "te mando a segunda via"
  if (/segunda via|manda(r)? (o )?(boleto|link)|reenvi|de novo|linha digitavel|codigo de barras|perdi o boleto/.test(t)) return 'segunda_via';
  return 'conversa';
}

// Qual aviso de boleto cabe hoje? vencimento e hoje em AAAA-MM-DD (Brasília). null = nenhum.
// Faixas (e não dia exato) para não perder aviso se o envio atrasar; a fila (unique tipo+telefone+ref) impede repetir.
function etapaBoleto(vencimento, hoje) {
  const dif = Math.round((Date.parse(vencimento + 'T12:00:00Z') - Date.parse(hoje + 'T12:00:00Z')) / 864e5);
  if (dif === 1) return 'boleto_antes';
  if (dif === 0) return 'boleto_vence';
  if (dif <= -1 && dif >= -4) return 'boleto_atraso_1';
  if (dif <= -5 && dif >= -10) return 'boleto_atraso_5';
  return null; // longe do vencimento ou atraso grande: só a recepção cuida
}

// Boleto só entra na fila se estiver aberto, com valor, vencimento e telefone.
function boletoValido(b) {
  return !!(b && b.telefone && /^\d{4}-\d{2}-\d{2}$/.test(b.vencimento || '') && Number(b.valor) > 0 &&
    !['pago', 'cancelado', 'baixado'].includes(String(b.situacao || b.status || '').toLowerCase()));
}

// ---------- TRAVAS ANTI-BLOQUEIO (WhatsApp não oficial / WAHA) ----------
// Nada aqui zera o risco: só a API oficial da Meta faz isso. Aqui ficam todos os cuidados do nosso lado.
const PADRAO = {
  janela: '08:00-19:00',   // só segunda a sábado, nesse horário (Brasília)
  limite_dia: 30,          // teto de mensagens ativas por dia, somando todos os tipos
  limite_hora: 10,         // teto por hora (evita rajada)
  intervalo_min_s: 40,     // intervalo ALEATÓRIO entre envios
  intervalo_max_s: 120,
  max_erros: 3,            // disjuntor: 3 falhas nos últimos envios → para o dia
};
const num = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));

// Sorteia o próximo intervalo (em segundos). O n8n grava enviado_em + este valor como "liberado_em".
function intervaloSorteado(cfg = {}, sorteio = Math.random()) {
  const min = num(cfg.intervalo_min_s, num(cfg.intervalo_s, PADRAO.intervalo_min_s));
  const max = Math.max(min, num(cfg.intervalo_max_s, cfg.intervalo_s ? Number(cfg.intervalo_s) * 2.5 : PADRAO.intervalo_max_s));
  return Math.round(min + sorteio * (max - min));
}

// Decide se pode enviar AGORA. extra = { liberado_em, enviados_ultima_hora, erros_recentes }.
function podeEnviar(agora, cfg = {}, enviadosHoje = 0, ultimoEnvio = null, extra = {}) {
  const br = new Date(agora.getTime() - 3 * 3600e3); // horário de Brasília
  const dia = br.getUTCDay();
  const hm = br.toISOString().slice(11, 16);
  const hoje = br.toISOString().slice(0, 10);
  const [ini, fim] = String(cfg.janela || PADRAO.janela).split('-');
  if (num(extra.erros_recentes, 0) >= num(cfg.max_erros, PADRAO.max_erros)) return { ok: false, motivo: 'disjuntor: erros de envio, parar e avisar o Ribeiro' };
  if (dia === 0) return { ok: false, motivo: 'domingo' };
  const feriados = Array.isArray(cfg.feriados) ? cfg.feriados : String(cfg.feriados || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (feriados.includes(hoje)) return { ok: false, motivo: 'feriado' };
  if (hm < ini || hm >= fim) return { ok: false, motivo: 'fora do horário' };
  if (enviadosHoje >= num(cfg.limite_dia, PADRAO.limite_dia)) return { ok: false, motivo: 'limite do dia' };
  if (num(extra.enviados_ultima_hora, 0) >= num(cfg.limite_hora, PADRAO.limite_hora)) return { ok: false, motivo: 'limite da hora' };
  if (extra.liberado_em && agora < new Date(extra.liberado_em)) return { ok: false, motivo: 'aguardando intervalo' };
  const piso = num(cfg.intervalo_min_s, num(cfg.intervalo_s, PADRAO.intervalo_min_s)) * 1000;
  if (ultimoEnvio && agora - new Date(ultimoEnvio) < piso) return { ok: false, motivo: 'aguardando intervalo' };
  return { ok: true };
}

// Celular brasileiro com DDI: 55 + DDD + 9 + 8 dígitos. Fixo ou número torto não recebe disparo.
const celularBR = (t) => /^55[1-9]\d9\d{8}$/.test(String(t || '').replace(/\D/g, ''));
const FRIOS = new Set(['campanha', 'reativacao', 'boleto_antes', 'boleto_vence', 'boleto_atraso_1', 'boleto_atraso_5']);

// Por que NÃO enviar para este paciente (null = pode). hist vem de `select * from ativo_historico(telefone)`:
// { ja_conversou, ativos_hoje, sem_resposta, conversa_aberta }.
function motivoInelegivel(lead, tipo, hist = {}) {
  if (!lead) return 'sem cadastro';
  if (lead.aceita_avisos === false) return 'pediu SAIR';
  if (lead.robo_pausado === true) return 'recepção assumiu a conversa';
  if (lead.telefone !== undefined && !celularBR(lead.telefone)) return 'telefone não é celular válido';
  const jaConversou = hist.ja_conversou ?? lead.ja_conversou;
  if (FRIOS.has(tipo) && !jaConversou) return 'nunca falou com a clínica no WhatsApp (contato frio)';
  if (num(hist.ativos_hoje, 0) >= 1) return 'já recebeu mensagem automática hoje';
  if (num(hist.sem_resposta, 0) >= 2) return 'ignorou as 2 últimas mensagens automáticas';
  if (hist.conversa_aberta) return 'está conversando agora';
  return null;
}
const elegivel = (lead, tipo, hist) => motivoInelegivel(lead, tipo, hist) === null;

// Link do boleto no 1º aviso? Só se cfg.ativo_boleto_link = 'sempre'. Padrão: manda depois que o paciente responder.
const linkNoPrimeiroAviso = (cfg = {}) => String(cfg.ativo_boleto_link || 'resposta') === 'sempre';

module.exports = { TEXTOS, PADRAO, montar, lerResposta, lerRespostaBoleto, etapaBoleto, boletoValido, brl, intervaloSorteado,
  podeEnviar, elegivel, motivoInelegivel, celularBR, linkNoPrimeiroAviso, primeiroNome };
