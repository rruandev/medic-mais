// node robo/testes/testar-orcamento.cjs  (dados fictícios; nenhuma chamada real ao Sigma)
const o = require('../orcamento.cjs');
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
ok(o.extrairNascimento('nasci em 12/03/1985') === '1985-03-12', 'nasc barra');
ok(o.extrairNascimento('12-3-85') === '1985-03-12', 'nasc 2 dígitos');
ok(o.extrairNascimento('12031985') === '1985-03-12', 'nasc colado');
ok(o.extrairNascimento('31/02/1985') !== null && o.extrairNascimento('45/13/1985') === null, 'nasc inválido');
ok(o.extrairNascimento('quero meu orçamento') === null, 'sem nasc');
ok(o.nomeConfere('maria silva', 'MARIA APARECIDA DA SILVA'), 'omite nome do meio');
ok(!o.nomeConfere('maria', 'MARIA APARECIDA DA SILVA'), 'só primeiro nome não vale');
ok(!o.nomeConfere('maria souza', 'MARIA APARECIDA DA SILVA'), 'sobrenome errado');
ok(!o.nomeConfere('aparecida silva', 'MARIA APARECIDA DA SILVA'), 'primeiro nome diferente');
ok(o.nomeConfere('José Conceição', 'JOSE CONCEICAO LIMA'), 'acento');
const BASE = {
  paciente: [{ id: 7, nome: 'MARIA APARECIDA DA SILVA', nascimento: '1985-03-12' }, { id: 8, nome: 'MARIA SILVA SANTOS', nascimento: '1985-03-12' }, { id: 9, nome: 'JOAO PEREIRA', nascimento: '1985-03-12' }],
  orcamento: [{ data: '2026-10-20', itens: [{ procedimento: 'Limpeza moderada', valor: 180 }, { procedimento: 'Restauração 2 faces', quantidade: 2, valor: 300 }], total: 480 }],
};
const get = async (r, p) => { get.chamadas.push([r, p]); if (r === 'paciente') return BASE.paciente; return p.idpaciente === 7 ? BASE.orcamento : []; };
(async () => {
  get.chamadas = [];
  let r = await o.consultar({ nome: 'Maria', mensagem: '12/03/1985', sigmaGet: get });
  ok(r.status === 'pedir_nome' && get.chamadas.length === 0, 'só primeiro nome: não consulta');
  r = await o.consultar({ nome: 'Maria Aparecida Silva', mensagem: 'quero meu orçamento', sigmaGet: get });
  ok(r.status === 'pedir_nascimento' && get.chamadas.length === 0, 'sem nascimento: não consulta');
  r = await o.consultar({ nome: 'Maria Aparecida Silva', mensagem: 'nasci 12/03/1985', sigmaGet: get });
  ok(r.status === 'ok' && r.texto.includes('Limpeza moderada: R$ 180,00') && r.texto.includes('2x Restauração 2 faces') && r.texto.includes('Total: R$ 480,00'), 'orçamento ok');
  console.log(r.texto);
  r = await o.consultar({ nome: 'Maria Silva', mensagem: '12/03/1985', sigmaGet: get });
  ok(r.status === 'ambiguo' && r.chamar_humano && r.resposta === o.NEUTRA, 'dois achados: humano, sem vazar');
  r = await o.consultar({ nome: 'Carlos Lima', mensagem: '12/03/1985', sigmaGet: get });
  ok(r.status === 'nao_achou' && r.resposta === o.NEUTRA, 'não achou: resposta neutra');
  ok(get.chamadas.every(([rec]) => rec === 'paciente' || rec === 'orcamento') , 'só leituras');
  console.log(falhas ? `${falhas} falha(s)` : 'orcamento: tudo certo');
  process.exitCode = falhas ? 1 : 0;
})();
