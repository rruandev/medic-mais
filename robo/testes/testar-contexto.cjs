// node robo/testes/testar-contexto.cjs
const { montarContexto } = require('../contexto.cjs');
let f = 0; const ok = (c, m) => { if (!c) { f++; console.log('FALHOU:', m); } };
const agora = new Date('2026-11-06T13:30:00Z'); // sexta 10h30 em Brasília
const msgs = [
  { direcao: 'in', texto: 'quanto custa o clínico?', criado_em: '2026-10-22T18:00:00Z' },
  { direcao: 'out', texto: 'R$150 particular...', criado_em: '2026-10-22T18:00:30Z' },
  { direcao: 'in', texto: 'vou pensar', criado_em: '2026-10-22T18:05:00Z' },
  { direcao: 'in', texto: 'oi, bom dia', criado_em: '2026-11-06T13:29:00Z' },
  { direcao: 'out', texto: '', criado_em: '2026-11-06T13:29:10Z' },
];
const r = montarContexto({ agora, mensagens: msgs, lead: { nome: 'Ana', interesse: 'consulta', especialidade: 'clínico geral', ultima_objecao: 'pensar', etapa: 'conversando' } });
console.log(r.contexto, '\n', r.historico);
ok(r.contexto.includes('sexta-feira, 6 de novembro de 2026, 10h30'), 'data/dia');
ok(r.contexto.includes('há 2 semana(s) (22/10)') && r.contexto.includes('NOVA conversa'), 'conversa antiga separada');
ok(r.historico.length === 1 && r.historico[0].content === 'oi, bom dia', 'só o atendimento atual, sem msg vazia');
const novo = montarContexto({ agora, mensagens: [{ direcao: 'in', texto: 'oi', criado_em: '2026-11-06T13:29:00Z' }] });
ok(novo.contexto.includes('primeiro contato'), 'primeiro contato');
const at = montarContexto({ agora, mensagens: [{ direcao: 'in', texto: '1', criado_em: '2026-11-06T13:29:00Z' }], lead: { nome: 'Ana' },
  envioAtivo: { tipo: 'confirmacao', enviado_em: '2026-11-06T13:00:00Z', texto: 'Oi, Ana! ... confirmar sua consulta' } });
ok(at.contexto.includes('a clínica mandou a primeira mensagem (confirmacao) hoje'), 'início por mensagem ativa');
const mesmo = montarContexto({ agora, mensagens: [{ direcao: 'in', texto: 'oi', criado_em: '2026-11-06T09:00:00Z' }, { direcao: 'out', texto: 'olá', criado_em: '2026-11-06T09:01:00Z' }, { direcao: 'in', texto: 'e o preço?', criado_em: '2026-11-06T13:29:00Z' }] });
ok(mesmo.historico.length === 3, 'mesmo dia (4h de pausa) continua o mesmo atendimento');
console.log(f ? f + ' falha(s)' : 'contexto: tudo certo'); process.exitCode = f ? 1 : 0;
