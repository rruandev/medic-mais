// Mensagens ativas do robô MedicMais: textos, quem recebe, quando e como ler a resposta.
// Funções puras (sem banco, sem WhatsApp) para o n8n chamar e para testar aqui.

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };
// Saudação pelo horário de Brasília na hora do envio (bom dia / boa tarde / boa noite).
const saud = () => { const h = new Date(Date.now() - 3 * 3600e3).getUTCHours(); return h >= 5 && h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const ola = (n) => (primeiroNome(n) ? `${saud()}, ${primeiroNome(n)}!` : `${saud()}!`);
const dataBR = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}`; };
const diaSemana = (iso) => DIAS[new Date(iso + 'T12:00:00-03:00').getUTCDay()];

// Variações de texto: cada envio sorteia uma (mensagem idêntica em massa aumenta risco de bloqueio).
const TEXTOS = {
  confirmacao: [
    (c) => `${ola(c.nome)} Aqui é a Maria, do atendimento da MedicMais Sobradinho 💙\nPassando para confirmar sua consulta com ${c.profissional} ${c.quando}, às ${c.hora}.\n\nResponda:\n1 - Confirmo\n2 - Preciso remarcar\n3 - Não vou poder ir`,
    (c) => `${ola(c.nome)} É a Maria, do atendimento da MedicMais Sobradinho 💙\nSua consulta com ${c.profissional} está marcada para ${c.quando}, às ${c.hora}. Posso confirmar?\n\n1 - Sim, confirmo\n2 - Quero remarcar\n3 - Não poderei ir`,
  ],
  lembrete_dia: [
    (c) => `${ola(c.nome)} Te esperamos hoje às ${c.hora} com ${c.profissional} na MedicMais Sobradinho 💙 Se puder, chegue 10 minutinhos antes.`,
  ],
  falta: [
    (c) => `${ola(c.nome)} Aqui é a Maria, do atendimento da MedicMais. Sentimos sua falta na consulta de ontem com ${c.profissional}. Está tudo bem? Quer que eu veja um novo horário pra você?`,
  ],
  followup: [ // conversa parou sem agendar (24 h depois)
    (c) => `${ola(c.nome)} Aqui é a Maria, do atendimento da MedicMais 💙 Ficou alguma dúvida sobre ${c.assunto || 'o atendimento'}? Se quiser, já vejo um horário pra você.`,
    (c) => `${ola(c.nome)} Passando para saber se consigo te ajudar com ${c.assunto || 'o seu atendimento'}. Tenho horários essa semana, prefere manhã ou tarde?`,
  ],
  followup_2: [ // 2ª e última tentativa (72 h depois)
    (c) => `${ola(c.nome)} Não quero te incomodar, é só para não deixar você sem resposta. Quando quiser cuidar ${c.assunto ? 'do(a) ' + c.assunto : 'disso'}, é só me chamar aqui 💙`,
  ],
  pediu_para_chamar: [ // "me chama sexta"
    (c) => `${ola(c.nome)} Combinamos de conversar hoje 😊 Aqui é a Maria, do atendimento da MedicMais. Vamos ver aquele horário ${c.assunto ? 'para ' + c.assunto : ''}? Prefere manhã ou tarde?`,
  ],
  exames: [ // consulta feita, exames pedidos e não feitos (2 dias depois)
    (c) => `${ola(c.nome)} Aqui é a Maria, do atendimento da MedicMais 💙 Vi que o(a) ${c.profissional} pediu alguns exames. Quer que eu já deixe sua coleta agendada? A análise é da DASA e a nossa enfermeira tem a mão leve 😉`,
  ],
  retorno: [
    (c) => `${ola(c.nome)} Seus exames já ficaram prontos? Lembrando que você pode voltar para mostrar os resultados ao médico. Quer que eu reserve seu retorno?`,
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

// Decide se pode enviar agora (trava de segurança para o WhatsApp não oficial).
function podeEnviar(agora, cfg, enviadosHoje, ultimoEnvio) {
  const br = new Date(agora.getTime() - 3 * 3600e3); // horário de Brasília
  const dia = br.getUTCDay();
  const hm = br.toISOString().slice(11, 16);
  const [ini, fim] = String(cfg.janela || '08:00-19:00').split('-');
  if (dia === 0) return { ok: false, motivo: 'domingo' };
  if (hm < ini || hm >= fim) return { ok: false, motivo: 'fora do horário' };
  if (enviadosHoje >= Number(cfg.limite_dia || 80)) return { ok: false, motivo: 'limite do dia' };
  const intervalo = Number(cfg.intervalo_s || 45) * 1000;
  if (ultimoEnvio && agora - ultimoEnvio < intervalo) return { ok: false, motivo: 'aguardando intervalo' };
  return { ok: true };
}

// Quem pode receber mensagem ativa.
function elegivel(lead, tipo) {
  if (!lead || lead.aceita_avisos === false) return false;
  if (tipo === 'campanha') return !!lead.ja_conversou; // só quem já falou com a clínica
  return true;
}

module.exports = { TEXTOS, montar, lerResposta, podeEnviar, elegivel, primeiroNome };
