// Busca na base de conhecimento do robô MedicMais (sem dependências, roda no Code node do n8n).
// Ideia: em vez de mandar a apostila inteira para a IA a cada mensagem, mandamos só os 3-4 trechos
// mais parecidos com o que o paciente escreveu (BM25 com sinônimos). Custo zero, resposta em < 5 ms.

const PARADAS = new Set(('a o e é de da do das dos em no na nos nas um uma uns umas para pra pro por com sem que se ' +
  'eu me meu minha voce você vc ele ela isso esse essa este esta aqui ai aí la lá ja já tem ter tô to ta tá ' +
  'mais muito bem oi ola olá bom boa dia tarde noite tudo obrigado obrigada sim nao não queria quero gostaria saber ' +
  'qual quais como onde quando qual vocês voces ou ao aos as os sua seu mim lhe nos nós foi ser sou está esta estou').split(/\s+/));

// Palavras do paciente → termos da base. Ampliar aqui quando aparecer jeito novo de perguntar.
const SINONIMOS = {
  quanto: 'preco valor', custa: 'preco valor', valor: 'preco', preco: 'valor', caro: 'caro preco', barato: 'preco caro',
  dentista: 'odonto dente', dente: 'odonto dentista', dentes: 'odonto dentista', odontologico: 'odonto dentista',
  implante: 'odonto implante', aparelho: 'odonto', canal: 'odonto', clareamento: 'odonto', limpeza: 'odonto',
  plano: 'convenio', convenio: 'plano', convenios: 'convenio',
  ultrassom: 'ecografia', ultrasom: 'ecografia', usg: 'ecografia', eco: 'ecografia',
  hemograma: 'exame sangue laboratorio', sangue: 'exame laboratorio', laboratorio: 'exame', checkup: 'check-up exame',
  gineco: 'ginecologia', ginecologista: 'ginecologia', endocrino: 'endocrinologia', endocrinologista: 'endocrinologia',
  pediatra: 'pediatria', psicologo: 'psicologia', psicologa: 'psicologia', psiquiatra: 'psiquiatria', geriatra: 'geriatria',
  clinico: 'clinico consulta medico', medico: 'consulta', medica: 'consulta', consulta: 'medico',
  parcelar: 'parcela', parcelado: 'parcela', vezes: 'parcela', cartao: 'cartao parcela', pix: 'pagamento vista',
  gratis: 'gratuito gratuita', graca: 'gratuito gratuita', gratuito: 'gratis',
  marcar: 'agendar horario', agendar: 'marcar horario', horario: 'agendar', vaga: 'horario agendar',
  longe: 'distancia', distante: 'distancia', ocupado: 'ocupado tempo', correria: 'ocupado',
  pensar: 'pensar depois', depois: 'pensar', medo: 'medo', pavor: 'medo', agulha: 'agulha picada coleta',
  orcar: 'cotar orcamento', orcamento: 'cotar', pesquisar: 'cotar', cotar: 'orcamento',
};

function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// "Raiz" simples em português: tira plural e algumas terminações comuns.
function raiz(p) {
  if (p.length <= 3) return p;
  return p.replace(/(coes|soes)$/, 'c').replace(/(cao|sao)$/, 'c').replace(/(mente)$/, '')
    .replace(/(istas|ista)$/, 'ist').replace(/(ias|ia)$/, 'i').replace(/(os|as|es)$/, '').replace(/s$/, '')
    .replace(/[aeo]$/, '');
}

function termos(texto, expandir) {
  const out = [];
  for (const p of normalizar(texto).split(' ')) {
    if (!p || PARADAS.has(p)) continue;
    out.push(raiz(p));
    if (expandir && SINONIMOS[p]) for (const s of SINONIMOS[p].split(' ')) out.push(raiz(normalizar(s)));
  }
  return out;
}

function criarIndice(itens) {
  const docs = itens.map((it) => {
    // gatilhos e tema pesam mais que o texto (repetidos)
    const ts = [...termos(it.tema, false), ...termos(it.tema, false), ...termos(it.gatilhos, false),
      ...termos(it.gatilhos, false), ...termos(it.texto, false)];
    const tf = new Map();
    for (const t of ts) tf.set(t, (tf.get(t) || 0) + 1);
    return { it, tf, len: ts.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const media = docs.reduce((s, d) => s + d.len, 0) / docs.length;
  return { docs, df, media, N: docs.length };
}

function buscar(indice, pergunta, k = 3, minimo = 1.2) {
  const q = [...new Set(termos(pergunta, true))];
  const K1 = 1.2, B = 0.6;
  const res = indice.docs.map((d) => {
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = indice.df.get(t);
      const idf = Math.log(1 + (indice.N - n + 0.5) / (n + 0.5));
      s += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / indice.media));
    }
    return { id: d.it.id, score: Math.round(s * 100) / 100, item: d.it };
  }).filter((r) => r.score >= minimo).sort((a, b) => b.score - a.score);
  return res.slice(0, k);
}

// Convênios: apelidos que o paciente usa → nome na lista.
const APELIDOS_CONVENIO = {
  'gdf': 'GDF SAÚDE', 'inas': 'GDF SAÚDE', 'brb': 'BRB', 'regius': 'BRB', 'caixa': 'SAÚDE CAIXA', 'correios': 'POSTAL SAÚDE',
  'postal': 'POSTAL SAÚDE', 'policia federal': 'PF SAÚDE', 'pf': 'PF SAÚDE', 'pm': 'PMDF', 'policia militar': 'PMDF',
  'bombeiro': 'CBMDF', 'bombeiros': 'CBMDF', 'exercito': 'FUSEX', 'senado': 'SIS SENADO', 'camara': 'CÂMARA DOS DEPUTADOS',
  'tjdft': 'PRÓ-SAÚDE (TJDFT)', 'stf': 'STF-MED', 'stj': 'PRÓ-SER (STJ)', 'banco central': 'BACEN', 'embrapa': 'CASEMBRAPA',
  'allianz': 'AGF - ALLIANZ', 'evida': 'LUMINAR SAÚDE', 'luminar': 'LUMINAR SAÚDE', 'bndes': 'FAPES', 'petrobras': 'SAÚDE PETROBRAS',
  'mpu': 'PLAN ASSISTE', 'stm': 'PLAS/JMU', 'codevasf': 'CASEC', 'telos': 'EMBRATEL', 'embratel': 'EMBRATEL',
};
const GENERICAS = new Set(['saude', 'plano', 'convenio', 'de', 'do', 'da', 'dos', 'demais', 'planos', 'tribunal', 'regional', 'federal', 'consultas', 'medicas']);

function acharConvenio(lista, texto) {
  const n = ' ' + normalizar(texto) + ' ';
  const achados = new Map();
  for (const [ap, alvo] of Object.entries(APELIDOS_CONVENIO)) {
    if (n.includes(' ' + ap + ' ')) for (const c of lista) if (normalizar(c.nome).includes(normalizar(alvo))) achados.set(c.nome, c);
  }
  for (const c of lista) {
    const palavras = normalizar(c.nome).split(' ').filter((p) => p.length >= 3 && !GENERICAS.has(p));
    if (palavras.length && palavras.some((p) => n.includes(' ' + p + ' '))) achados.set(c.nome, c);
  }
  return [...achados.values()];
}

module.exports = { normalizar, termos, criarIndice, buscar, acharConvenio };
