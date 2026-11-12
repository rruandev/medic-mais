// Consulta de orçamentos do paciente no Sigma (SOMENTE LEITURA) pelo nome.
// Funções puras + um orquestrador que recebe `sigmaGet(recurso, params)` (o n8n injeta o HTTP). Nada é gravado.
//
// Privacidade: orçamento é dado de saúde/financeiro. Só revela depois de NOME COMPLETO + DATA DE NASCIMENTO
// baterem com UM único cadastro. O Sigma não busca paciente por nome nem nascimento (só cpf ou idpaciente), então o nome
// é filtrado aqui sobre a lista de orçamentos e o nascimento é conferido no cadastro. Qualquer dúvida (0 ou 2+ achados) → mesma resposta neutra, sem vazar nada.
//
// Campos reais do Sigma (conferidos em leitura real, 12/11/2026):
//  GET /orcamento/?dataini=AAAA-MM-DD&datafin=AAAA-MM-DD  (ou ?idpaciente=ID) → {bErro,msgErro,qtdRegistros,data:[...]}
//    cada item: orcamento, abertura, valor_bruto, desconto, valor_liquido, situacao, fechamento,
//               paciente{idpaciente,nome,cpf}, Exame/Odontologica/Medica ('S'|'N'). Não há lista de procedimentos.
//  GET /paciente/?idpaciente=ID → data:[{id,nome,cpf,sexo,nascimento,fones}]   (/paciente NÃO busca por nome nem nascimento)
// Estratégia: lista os orçamentos dos últimos MESES meses, filtra pelo NOME aqui e confere o nascimento no cadastro.
const MESES = 12;
const MAX_CANDIDATOS = 5;
const unwrap = (r) => (Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : []));

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const partes = (s) => sem(s).split(' ').filter((p) => p && !LIGACOES.has(p));

// "12/03/1985", "12-3-85", "12 03 1985", "12031985" → "1985-03-12" (ou null).
function extrairNascimento(texto) {
  const t = String(texto || '');
  const m = t.match(/\b(\d{1,2})\s*[\/.\-\s]\s*(\d{1,2})\s*[\/.\-\s]\s*(\d{4}|\d{2})\b/) || t.match(/\b(\d{2})(\d{2})(\d{4})\b/);
  if (!m) return null;
  let [, d, mo, a] = m; d = +d; mo = +mo; a = +a;
  if (a < 100) a += a > (new Date().getFullYear() % 100) ? 1900 : 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || a < 1900 || a > new Date().getFullYear()) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${a}-${p(mo)}-${p(d)}`;
}

// Nome completo = pelo menos nome e sobrenome. O que o paciente digitou precisa estar TODO contido no cadastro
// (aceita que ele omita nomes do meio, nunca que invente) e o primeiro nome tem de ser igual.
function nomeConfere(digitado, cadastro) {
  const a = partes(digitado), b = partes(cadastro);
  if (a.length < 2 || !b.length || a[0] !== b[0]) return false;
  return a.every((p) => b.includes(p));
}

const nascISO = (v) => { const s = String(v || ''); const m = s.match(/(\d{4})-(\d{2})-(\d{2})/) || s.match(/(\d{2})\/(\d{2})\/(\d{4})/); if (!m) return null; return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`; };

function normalizarOrcamento(o) {
  const n = (v) => (v == null || v === '' ? NaN : Number(String(v).replace(',', '.')));
  const tipos = [o.Medica === 'S' && 'médico', o.Odontologica === 'S' && 'odontológico', o.Exame === 'S' && 'exames'].filter(Boolean);
  return { numero: o.orcamento, data: nascISO(o.abertura), situacao: String(o.situacao || '').trim(), fechamento: nascISO(o.fechamento), bruto: n(o.valor_bruto), desconto: n(o.desconto), liquido: n(o.valor_liquido), tipos };
}

const brl = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Texto que o robô usa (a IA reescreve no tom da assistente, mas os números vêm daqui).
function formatar(orcs, { mostrarValores = true } = {}) {
  if (!orcs.length) return 'NENHUM_ORCAMENTO';
  return orcs.map((o, n) => {
    const l = [`Orçamento ${n + 1}${o.data ? ' de ' + dataBR(o.data) : ''}${o.situacao ? ' (' + o.situacao + ')' : ''}${o.tipos.length ? ' - ' + o.tipos.join(', ') : ''}`];
    if (mostrarValores && isFinite(o.liquido)) {
      if (isFinite(o.desconto) && o.desconto > 0 && isFinite(o.bruto)) l.push(`Valor: ${brl(o.bruto)}; desconto: ${brl(o.desconto)}`);
      l.push(`Total: ${brl(o.liquido)}`);
    }
    return l.join('\n');
  }).join('\n\n');
}

const NEUTRA = 'Não consegui localizar um cadastro com esses dados. Pode conferir o nome completo e a data de nascimento? Se preferir, a equipe confere para você.';
const iso = (d) => d.toISOString().slice(0, 10);

// Passo 1: dos orçamentos listados, separa os de pacientes cujo nome confere (agrupados por idpaciente).
function candidatos(todos, nome) {
  const m = new Map();
  for (const o of unwrap(todos)) {
    const p = o.paciente || {};
    if (p.idpaciente != null && nomeConfere(nome, p.nome)) { const k = String(p.idpaciente); if (!m.has(k)) m.set(k, []); m.get(k).push(o); }
  }
  return m;
}

// Passo 2: com os cadastros dos candidatos (idpaciente → registro de /paciente), decide. Só 1 achado fecha.
function decidir({ nasc, cands, cadastros, mostrarValores = true }) {
  const achados = [];
  for (const [id, lista] of cands) { const cad = cadastros[id]; if (cad && nascISO(cad.nascimento) === nasc) achados.push({ id, nome: cad.nome, lista }); }
  if (achados.length !== 1) return { status: achados.length ? 'ambiguo' : 'nao_achou', resposta: NEUTRA, chamar_humano: achados.length > 1 };
  const orcs = achados[0].lista.map(normalizarOrcamento).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { status: 'ok', primeiro_nome: partes(achados[0].nome)[0], texto: formatar(orcs, { mostrarValores }), quantidade: orcs.length };
}

// sigmaGet('orcamento', {dataini, datafin}) e sigmaGet('paciente', {idpaciente}) → resposta do Sigma (envelope ou array). Só leitura.
async function consultar({ nome, mensagem, sigmaGet, mostrarValores = true, hoje = new Date() }) {
  const nasc = extrairNascimento(mensagem);
  if (partes(nome).length < 2) return { status: 'pedir_nome', resposta: 'Para eu consultar, me diga o nome completo do paciente (nome e sobrenome).' };
  if (!nasc) return { status: 'pedir_nascimento', resposta: 'Por segurança, preciso também da data de nascimento do paciente (dia/mês/ano) para consultar o orçamento.' };
  const ini = new Date(hoje); ini.setMonth(ini.getMonth() - MESES);
  const cands = candidatos(await sigmaGet('orcamento', { dataini: iso(ini), datafin: iso(hoje) }), nome);
  if (cands.size > MAX_CANDIDATOS) return { status: 'ambiguo', resposta: NEUTRA, chamar_humano: true };
  const cadastros = {};
  for (const id of cands.keys()) cadastros[id] = unwrap(await sigmaGet('paciente', { idpaciente: id }))[0];
  return decidir({ nasc, cands, cadastros, mostrarValores });
}

module.exports = { extrairNascimento, nomeConfere, normalizarOrcamento, formatar, candidatos, decidir, consultar, NEUTRA, MESES, MAX_CANDIDATOS, partes, iso };
