// node robo/testes/testar-orcar-exames.cjs  (catálogo fictício; nenhuma chamada ao Sigma)
const e = require('../orcar-exames.cjs');
let falhas = 0; const ok = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
const it = (descricao, vlr_bruto, qtde = '1') => ({ descricao, vlr_bruto, qtde, vlr_liquido: vlr_bruto, desconto: '0' });
const cat = e.montarCatalogo({ data: [
  { exames: [it('HEMOGRAMA', '19.50'), it('GLICOSE', '7.50'), it('VITAMINA D - 25 HIDROXI', '84.50'), it('1,25 DIHIDROXI VITAMINA D', '150.00'), it('TSH - HORMÔNIO TIREOESTIMULANTE - ULTRASSENSIVEL', '14.80'), it('TRAB - ANTICORPO ANTI RECEPTOR DE TSH', '90.00'), it('COLESTEROL TOTAL', '8.00'), it('COLESTEROL - HDL', '9.00'), it('UREIA', '15.30', '2')] },
  { exames: [it('HEMOGRAMA', '25.75'), it('HEMOGRAMA', '19.50')] },
] });
ok(cat.find((c) => c.descricao === 'HEMOGRAMA').preco === 19.5, 'preço mais frequente');
ok(cat.find((c) => c.descricao === 'UREIA').preco === 7.65, 'preço unitário = bruto/qtde');
let r = e.orcar(cat, 'hemograma, glicemia, vitamina D, TSH');
ok(r.status === 'ok' && r.itens.length === 4, 'acha com sinônimo/acento: ' + JSON.stringify(r.confirmar));
ok(r.soma === 126.3 && r.a_vista === 101.04, 'soma e 20% à vista: ' + r.soma + ' ' + r.a_vista);
r = e.orcar(cat, ['hemograma', 'colesterol', 'raio x']);
ok(r.status === 'parcial' && r.itens.length === 1 && r.confirmar.length === 2, 'ambíguo e inexistente vão para confirmar');
ok(/colesterol: a confirmar com a equipe \(pode ser/.test(r.texto) && /raio x: a confirmar/.test(r.texto), 'texto de confirmar');
ok(r.soma === 19.5 && r.a_vista === 15.6, 'total só dos confirmados');
r = e.orcar(cat, 'exame inexistente');
ok(r.status === 'nada' && r.soma === 0, 'nada achado');
console.log(r.texto); console.log(e.orcar(cat, 'hemograma e ureia').texto);
console.log(falhas ? `${falhas} falha(s)` : 'orcar-exames: tudo certo'); process.exitCode = falhas ? 1 : 0;
