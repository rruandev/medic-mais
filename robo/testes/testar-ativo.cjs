// node robo/testes/testar-ativo.cjs
const a = require('../ativo.cjs');
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
const conf = a.montar('confirmacao', { nome: 'MARIA DA SILVA', profissional: 'Dr. Thiago', data: '2026-11-16', hora: '08:30', hoje: '2026-11-15' }, 0);
console.log(conf, '\n---');
ok(/(Bom dia|Boa tarde|Boa noite), Maria!/.test(conf) && conf.includes('amanhã (segunda, 16/11)') && !conf.includes('SAIR'), 'confirmação');
const fu = a.montar('followup', { nome: 'joão', assunto: 'o seu check-up' }, 0.9);
console.log(fu, '\n---');
ok(fu.includes('SAIR') && /, João!/.test(fu), 'follow-up com SAIR');
const R = { '1': 'confirmar', 'Sim, confirmo': 'confirmar', 'confirmado!': 'confirmar', '2': 'remarcar', 'preciso remarcar': 'remarcar',
  'dá pra mudar o horário?': 'remarcar', '3': 'cancelar', 'não vou poder ir': 'cancelar', 'SAIR': 'sair', 'quanto custa o exame?': 'conversa' };
for (const [t, e] of Object.entries(R)) ok(a.lerResposta(t) === e, `resposta "${t}" → ${a.lerResposta(t)} (esperado ${e})`);
const cfg = { janela: '08:00-19:00', limite_dia: 80, intervalo_s: 45 };
ok(a.podeEnviar(new Date('2026-11-09T13:00:00Z'), cfg, 0, null).ok, 'segunda 10h pode');
ok(!a.podeEnviar(new Date('2026-11-08T13:00:00Z'), cfg, 0, null).ok, 'domingo não');
ok(!a.podeEnviar(new Date('2026-11-09T23:00:00Z'), cfg, 0, null).ok, '20h não');
ok(!a.podeEnviar(new Date('2026-11-09T13:00:00Z'), cfg, 80, null).ok, 'limite');
ok(!a.podeEnviar(new Date('2026-11-09T13:00:00Z'), cfg, 1, new Date('2026-11-09T12:59:40Z')).ok, 'intervalo');
ok(!a.elegivel({ aceita_avisos: false }, 'confirmacao'), 'SAIR bloqueia');
ok(!a.elegivel({ ja_conversou: false }, 'campanha'), 'campanha só p/ quem conversou');
// --- boleto e reativação ---
const b1 = a.montar('boleto_antes', { nome: 'JOSÉ SILVA', valor: 1234.5, vencimento_iso: '2026-11-20', descricao: 'tratamento odontológico', link: 'https://x.test/abc' }, 0);
ok(b1.includes('R$ 1.234,50') && b1.includes('20/11') && b1.includes('https://x.test/abc') && b1.includes('Fátima') && b1.includes('SAIR') && /, José!/.test(b1), 'boleto antes');
const b2 = a.montar('boleto_atraso_1', { nome: 'ana', valor: 150, vencimento_iso: '2026-11-15' }, 0);
ok(b2.includes('R$ 150,00') && !b2.includes('undefined') && !b2.includes('referente'), 'boleto sem link nem descrição');
ok(!a.montar('reativacao', { nome: 'Ana' }, 0.9).includes('undefined'), 'reativação');
const E = [['2026-11-18', 'boleto_antes'], ['2026-11-17', 'boleto_vence'], ['2026-11-16', 'boleto_atraso_1'], ['2026-11-13', 'boleto_atraso_1'], ['2026-11-12', 'boleto_atraso_5'], ['2026-11-07', 'boleto_atraso_5'], ['2026-11-06', null], ['2026-11-25', null]];
for (const [v, e] of E) ok(a.etapaBoleto(v, '2026-11-17') === e, `etapa ${v} → ${a.etapaBoleto(v, '2026-11-17')} (esperado ${e})`);
const RB = { 'não consigo pagar': 'negociar', 'tem desconto?': 'negociar', 'posso parcelar?': 'negociar', 'já paguei ontem': 'paguei', 'manda o boleto de novo': 'segunda_via', 'SAIR': 'sair', 'ok obrigada': 'conversa' };
for (const [t, e] of Object.entries(RB)) ok(a.lerRespostaBoleto(t) === e, `boleto "${t}" → ${a.lerRespostaBoleto(t)} (esperado ${e})`);
ok(a.lerResposta('não consigo pagar') === 'cancelar', 'documenta: lerResposta não serve para boleto');
ok(a.boletoValido({ telefone: '5561999990000', vencimento: '2026-11-20', valor: 100, situacao: 'aberto' }), 'boleto aberto vale');
ok(!a.boletoValido({ telefone: '5561999990000', vencimento: '2026-11-20', valor: 100, situacao: 'pago' }), 'boleto pago não vale');
ok(!a.boletoValido({ telefone: '', vencimento: '2026-11-20', valor: 100 }) && !a.boletoValido({ telefone: '1', vencimento: '20/11', valor: 100 }) && !a.boletoValido({ telefone: '1', vencimento: '2026-11-20', valor: 0 }), 'boleto incompleto não vale');
ok(!a.elegivel({ aceita_avisos: false }, 'boleto_antes') && !a.elegivel({ ja_conversou: false }, 'reativacao') && a.elegivel({ ja_conversou: true }, 'reativacao'), 'elegibilidade');
console.log(falhas ? `${falhas} falha(s)` : 'ativo: tudo certo');
process.exitCode = falhas ? 1 : 0;
