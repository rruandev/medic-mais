// node robo/testes/testar-ativo.cjs
const a = require('../ativo.cjs');
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
const conf = a.montar('confirmacao', { nome: 'MARIA DA SILVA', profissional: 'Dr. Thiago', data: '2026-11-16', hora: '08:30', hoje: '2026-11-15' }, 0);
console.log(conf, '\n---');
ok(conf.includes('Oi, Maria!') && conf.includes('amanhã (segunda, 16/11)') && !conf.includes('SAIR'), 'confirmação');
const fu = a.montar('followup', { nome: 'joão', assunto: 'o seu check-up' }, 0.9);
console.log(fu, '\n---');
ok(fu.includes('SAIR'), 'follow-up com SAIR');
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
console.log(falhas ? `${falhas} falha(s)` : 'ativo: tudo certo');
process.exitCode = falhas ? 1 : 0;
