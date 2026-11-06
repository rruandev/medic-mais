// node robo/gerar-n8n.cjs → gera n8n/no-busca-conhecimento.js para colar num Code node ("Run Once for Each Item").
// Sempre que a base mudar: editar base/*.json, rodar os testes e gerar de novo.
const fs = require('fs'), path = require('path');
const busca = fs.readFileSync(path.join(__dirname, 'busca.cjs'), 'utf8').replace(/module\.exports[\s\S]*$/, '');
const base = require('./base/conhecimento.json');
const conv = require('./base/convenios.json').convenios;
// O campo "pendente" (anotação para a clínica) não vai para o robô.
const itens = base.itens.map(({ id, tema, gatilhos, texto }) => ({ id, tema, gatilhos, texto }));
const out = `// GERADO por robo/gerar-n8n.cjs em ${new Date().toISOString().slice(0, 10)} (base ${base.versao}). Não editar à mão.
// Entrada: $json.texto (mensagem do paciente). Saída: trechos (texto para o prompt), ids, convenios_achados.
${busca}
const ITENS = ${JSON.stringify(itens)};
const CONVENIOS = ${JSON.stringify(conv)};
const INDICE = criarIndice(ITENS);
const msg = String($json.texto || '');
const achados = buscar(INDICE, msg, 3);
const conv = acharConvenio(CONVENIOS, msg);
let trechos = achados.map((r) => '- ' + r.item.tema + ': ' + r.item.texto).join('\\n');
if (conv.length) trechos += '\\n- Convênio citado: ' + conv.map((c) => c.nome + ' (' + c.rede + ')').join(', ') + ' — ESTÁ na lista de convênios aceitos.';
else if (/conv[eê]nio|plano/i.test(msg)) trechos += '\\n- O plano citado NÃO foi achado na lista. Não confirme: diga que vai checar com a equipe.';
return { json: { ...$json, trechos: trechos || '(nenhum trecho: se não souber, chame a equipe)', trechos_ids: achados.map((r) => r.id), convenios_achados: conv.map((c) => c.nome) } };
`;
fs.writeFileSync(path.join(__dirname, 'n8n', 'no-busca-conhecimento.js'), out);
console.log('gerado n8n/no-busca-conhecimento.js', out.length, 'bytes');
