// Consulta de orçamentos do paciente no Sigma (SOMENTE LEITURA) pelo nome.
// Funções puras + um orquestrador que recebe `sigmaGet(recurso, params)` (o n8n injeta o HTTP). Nada é gravado.
//
// Privacidade: orçamento é dado de saúde/financeiro. Só revela depois de NOME COMPLETO + DATA DE NASCIMENTO
// baterem com UM único cadastro. O Sigma não busca paciente por nome (só cpf, id ou aniversário), então a busca é
// por aniversário e o nome é conferido aqui. Qualquer dúvida (0 ou 2+ achados) → mesma resposta neutra, sem vazar nada.
//
// ATENÇÃO: nomes dos campos do /orcamento e do parâmetro do paciente ainda NÃO foram vistos numa resposta real
// (só a chamada ?produto=S está documentada). Os mapas CAMPOS/PARAMS abaixo são palpites tolerantes: conferir com
// uma leitura real no Sigma e ajustar só aqui.

const PARAMS = { nascimento: 'aniversario', orcamentoPaciente: 'idpaciente' };
const CAMPOS = {
  id: ['id', 'idpaciente', 'idpessoa'],
  nome: ['nome', 'paciente', 'nomepaciente'],
  nascimento: ['nascimento', 'datanascimento', 'dt_nascimento', 'aniversario'],
  data: ['data', 'dataorcamento', 'dt_orcamento', 'datacadastro'],
  situacao: ['status', 'situacao', 'aprovado'],
  total: ['total', 'valortotal', 'valor_total', 'valor'],
  itens: ['itens', 'procedimentos', 'produtos', 'items'],
  itemNome: ['procedimento', 'produto', 'descricao', 'nome', 'servico'],
  itemValor: ['valor', 'preco', 'valortotal', 'total'],
  itemQtd: ['quantidade', 'qtd', 'qtde'],
};
const pega = (o, chaves) => { for (const k of chaves) if (o && o[k] != null && o[k] !== '') return o[k]; return undefined; };

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
  const lista = pega(o, CAMPOS.itens);
  const itens = (Array.isArray(lista) ? lista : []).map((i) => ({ nome: String(pega(i, CAMPOS.itemNome) || '').trim(), qtd: Number(pega(i, CAMPOS.itemQtd) || 1), valor: Number(pega(i, CAMPOS.itemValor)) }));
  return { data: nascISO(pega(o, CAMPOS.data)), situacao: pega(o, CAMPOS.situacao), total: Number(pega(o, CAMPOS.total)), itens };
}

const brl = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Texto que o robô pode usar (a IA reescreve no tom da Maria/Fátima, mas os números vêm daqui).
function formatar(orcs, { mostrarValores = true } = {}) {
  if (!orcs.length) return 'NENHUM_ORCAMENTO';
  return orcs.map((o, n) => {
    const cab = `Orçamento ${n + 1}${o.data ? ' de ' + dataBR(o.data) : ''}`;
    const linhas = o.itens.map((i) => `- ${i.qtd > 1 ? i.qtd + 'x ' : ''}${i.nome}${mostrarValores && isFinite(i.valor) ? ': ' + brl(i.valor) : ''}`);
    const tot = mostrarValores && isFinite(o.total) ? `Total: ${brl(o.total)}` : '';
    return [cab, ...linhas, tot].filter(Boolean).join('\n');
  }).join('\n\n');
}

const NEUTRA = 'Não consegui localizar um cadastro com esses dados. Pode conferir o nome completo e a data de nascimento? Se preferir, a equipe confere para você.';

// sigmaGet('paciente', {aniversario}) → array de pacientes ; sigmaGet('orcamento', {idpaciente}) → array de orçamentos.
async function consultar({ nome, mensagem, sigmaGet, mostrarValores = true }) {
  const nasc = extrairNascimento(mensagem);
  if (partes(nome).length < 2) return { status: 'pedir_nome', resposta: 'Para eu consultar, me diga o nome completo do paciente (nome e sobrenome).' };
  if (!nasc) return { status: 'pedir_nascimento', resposta: 'Por segurança, preciso também da data de nascimento do paciente (dia/mês/ano) para consultar o orçamento.' };
  const pacientes = (await sigmaGet('paciente', { [PARAMS.nascimento]: nasc })) || [];
  const achados = pacientes.filter((p) => nomeConfere(nome, pega(p, CAMPOS.nome)) && (!pega(p, CAMPOS.nascimento) || nascISO(pega(p, CAMPOS.nascimento)) === nasc));
  if (achados.length !== 1) return { status: achados.length ? 'ambiguo' : 'nao_achou', resposta: NEUTRA, chamar_humano: achados.length > 1 };
  const id = pega(achados[0], CAMPOS.id);
  const orcs = ((await sigmaGet('orcamento', { [PARAMS.orcamentoPaciente]: id })) || []).map(normalizarOrcamento).filter((o) => o.itens.length || isFinite(o.total));
  if (!orcs.length) return { status: 'sem_orcamento', resposta: 'Encontrei seu cadastro, mas não há orçamento registrado. Quer que eu chame a equipe para verificar?' };
  return { status: 'ok', primeiro_nome: partes(pega(achados[0], CAMPOS.nome))[0], texto: formatar(orcs, { mostrarValores }), quantidade: orcs.length };
}

module.exports = { extrairNascimento, nomeConfere, normalizarOrcamento, formatar, consultar, NEUTRA, PARAMS, CAMPOS };
