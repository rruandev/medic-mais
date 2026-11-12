// Orçamento de EXAMES a partir da tabela real do Sigma (SOMENTE LEITURA). Nada é gravado.
// Não existe endpoint de tabela de preços: o catálogo sai de GET /orcamento/?produto=S&dataini&datafin
// (itens em `exames[]`: descricao, qtde, vlr_bruto, ...). Preço unitário = vlr_bruto / qtde (valor mais frequente).
// Único desconto: 20% no pagamento À VISTA (só exames). Exame não achado/ambíguo → "a confirmar com a equipe"; nunca inventa valor.
const DESCONTO_AVISTA = 0.2;

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'exame', 'exames', 'o', 'a', 'um', 'uma', 'completo', 'total', 'dosagem', 'teste']);
const toks = (s) => sem(s).split(' ').filter((t) => t && !STOP.has(t));

// Sinônimos/apelidos comuns → termos como aparecem na descrição do Sigma.
const SINONIMOS = [
  [/\bglicemia\b|\bacucar\b|\bglicose em jejum\b/, 'glicose'],
  [/\bvit(amina)?\.?\s*d\b|\bvitd\b/, 'vitamina d 25 hidroxi'],
  [/\bvit(amina)?\.?\s*b\s*12\b|\bb12\b/, 'vitamina b12'],
  [/\bhba1c\b|\bhemoglobina glicosilada\b|\bglicada\b/, 'hemoglobina glicada'],
  [/\bt4 livre\b|\bt4l\b/, 't4 tiroxina livre'],
  [/\btgo\b|\bast\b/, 'tgo'],
  [/\btgp\b|\balt\b/, 'tgp'],
  [/\btriglic\w*/, 'triglicerides'],
  [/\bhemograma\b/, 'hemograma'],
  [/\burina\s*(tipo\s*)?(1|i)\b|\beas\b|\bexame de urina\b|\burina rotina\b/, 'urina tipo i'],
  [/\bpcr\b/, 'proteina c reativa'],
];
function aplicaSinonimo(pedido) {
  const s = sem(pedido);
  for (const [re, t] of SINONIMOS) if (re.test(s)) return t;
  return pedido;
}

// Monta o catálogo: [{descricao, preco, n}] a partir da resposta de /orcamento/?produto=S (envelope ou array).
function montarCatalogo(resp) {
  const lista = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.data) ? resp.data : []);
  const m = new Map();
  for (const o of lista) for (const it of (o.exames || [])) {
    const d = String(it.descricao || '').trim().toUpperCase(); const q = Number(it.qtde) || 1; const b = Number(String(it.vlr_bruto).replace(',', '.'));
    if (!d || !isFinite(b) || b <= 0) continue;
    const p = Math.round((b / q) * 100) / 100;
    if (!m.has(d)) m.set(d, new Map()); const c = m.get(d); c.set(p, (c.get(p) || 0) + 1);
  }
  return [...m].map(([descricao, c]) => { const [preco] = [...c].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]; return { descricao, preco, n: [...c.values()].reduce((x, y) => x + y, 0) }; });
}

// Procura um exame. → {tipo:'ok', item} | {tipo:'ambiguo', opcoes:[...]} | {tipo:'nao_achou'}
function achar(catalogo, pedido) {
  const alvo = toks(aplicaSinonimo(pedido));
  if (!alvo.length) return { tipo: 'nao_achou' };
  const inclui = (d) => { const t = toks(d); return alvo.every((a) => t.some((x) => x === a || (a.length >= 4 && x.startsWith(a)))); };
  const cand = catalogo.filter((c) => inclui(c.descricao));
  if (!cand.length) return { tipo: 'nao_achou' };
  const cabeca = (c) => toks(c.descricao.split(/ - |\(/)[0]).join(' ');
  // 1) exatamente 1 descrição cuja "cabeça" (antes de ' - ' ou '(') é o que foi pedido; 2) único candidato que cobre >= metade dos termos.
  const exato = cand.filter((c) => cabeca(c) === alvo.join(' '));
  if (exato.length === 1) return { tipo: 'ok', item: exato[0] };
  if (!exato.length && cand.length === 1 && alvo.length / toks(cand[0].descricao).length >= 0.5) return { tipo: 'ok', item: cand[0] };
  return { tipo: 'ambiguo', opcoes: cand.sort((a, b) => b.n - a.n).slice(0, 4).map((c) => c.descricao) };
}

const brl = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// pedidos: array de nomes de exames (ou string separada por vírgula/;/linha/" e ").
function orcar(catalogo, pedidos) {
  const lista = (Array.isArray(pedidos) ? pedidos : String(pedidos || '').split(/[,;\n]| e (?=[a-zà-ú])/i)).map((s) => String(s).trim()).filter(Boolean);
  const itens = [], confirmar = [];
  for (const p of lista) {
    const r = achar(catalogo, p);
    if (r.tipo === 'ok') itens.push({ pedido: p, descricao: r.item.descricao, valor: r.item.preco });
    else confirmar.push({ pedido: p, motivo: r.tipo, opcoes: r.opcoes });
  }
  const soma = Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  const aVista = Math.round(soma * (1 - DESCONTO_AVISTA) * 100) / 100;
  const linhas = itens.map((i) => `- ${i.descricao}: ${brl(i.valor)}`);
  if (itens.length) linhas.push(`Total: ${brl(soma)}`, `Total à vista (${DESCONTO_AVISTA * 100}% de desconto): ${brl(aVista)}`);
  for (const c of confirmar) linhas.push(`- ${c.pedido}: a confirmar com a equipe${c.opcoes ? ' (pode ser: ' + c.opcoes.join('; ') + ')' : ''}`);
  return { status: confirmar.length ? (itens.length ? 'parcial' : 'nada') : 'ok', itens, confirmar, soma, a_vista: aVista, texto: linhas.join('\n') || 'NENHUM_ITEM' };
}

module.exports = { montarCatalogo, achar, orcar, DESCONTO_AVISTA };
