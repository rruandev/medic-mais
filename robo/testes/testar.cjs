// node robo/testes/testar.cjs  → confere se a busca acha o trecho certo para cada pergunta de teste
const path = require('path');
const { criarIndice, buscar, acharConvenio } = require('../busca.cjs');
const base = require('../base/conhecimento.json');
const conv = require('../base/convenios.json').convenios;
const casos = require('./perguntas.json');
const ind = criarIndice(base.itens);
let top1 = 0, top3 = 0;
for (const [p, esperado] of casos) {
  const r = buscar(ind, p, 3);
  const ids = r.map((x) => x.id);
  if (ids[0] === esperado) top1++;
  if (ids.includes(esperado)) top3++; else console.log('FALHOU:', p, '→', ids.join(', ') || '(nada)', '| esperado', esperado);
}
console.log(`top1 ${top1}/${casos.length}  top3 ${top3}/${casos.length}`);
const convCasos = [['atende geap?', 'GEAP'], ['meu plano é saude caixa', 'SAÚDE CAIXA'], ['sou dos correios', 'POSTAL SAÚDE - CORREIOS'], ['tenho unimed', null], ['plano da policia militar', 'PMDF - CONSULTAS MÉDICAS'], ['bradesco saude', null], ['brb saude', 'BRB (SAÚDE BRB)']];
let ok = 0;
for (const [t, esp] of convCasos) {
  const a = acharConvenio(conv, t).map((c) => c.nome);
  const certo = esp === null ? a.length === 0 : a.includes(esp);
  if (certo) ok++; else console.log('CONVÊNIO FALHOU:', t, '→', a);
}
console.log(`convênios ${ok}/${convCasos.length}`);
const txt = base.itens.map((i) => i.texto).join(' ');
console.log('tamanho médio de 3 trechos ≈', Math.round(txt.length / base.itens.length * 3 / 4), 'tokens; base inteira ≈', Math.round(txt.length / 4), 'tokens');
process.exitCode = top3 === casos.length && ok === convCasos.length ? 0 : 1;
