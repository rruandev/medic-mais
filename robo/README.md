# Robô MedicMais (Fátima): treinamento, busca e mensagens ativas

Base criada em 06/11/2026 a partir do treinamento enviado pela clínica (apostila geral, script "O Fechamento",
"Como Vender Mais Exames", tabela de preços e lista de convênios AMHP/ASMEPRO) + decisões do Ribeiro de 05/11.
Os originais ficam na pasta do projeto (`clientes/medicmais/ensinamentos-robo/`).

## Por que busca em vez de "colar tudo no prompt"
- Prompt fixo (`prompt-base.md`) ≈ 450 tokens + 3 trechos da base ≈ 200 tokens + memória do paciente ≈ 80 tokens.
- Colar os 5 documentos inteiros seria ≈ 9.000 tokens por mensagem: ~10x mais caro e mais lento, e a IA se perde.
- A busca é BM25 com sinônimos em JavaScript puro (`busca.cjs`): roda dentro do n8n, sem banco nem API, em milissegundos.
- Teste (`node robo/testes/testar.cjs`): 40 perguntas reais de paciente → trecho certo entre os 3 primeiros em 40/40;
  convênios 7/7 (inclusive "tenho Unimed" → não achou → robô não confirma e chama a equipe).

## Arquivos
| Arquivo | O que é |
|---|---|
| `base/conhecimento.json` | 29 trechos curtos (preços, pagamento, convênio, odonto, exames, objeções, Saúde Day, urgência). Campo `pendente` = falta a clínica confirmar. |
| `base/convenios.json` | Os 73 convênios (AMHP / ASMEPRO). |
| `busca.cjs` | Busca nos trechos e nos convênios. |
| `contexto.cjs` | Data/dia da semana de Brasília, quem é o paciente, como a conversa começou (ele ou mensagem nossa) e corte do atendimento: depois de 12 h sem mensagem começa conversa NOVA; as antigas viram 1 linha de resumo com data. |
| `prompt-base.md` | Prompt fixo da Fátima + formato da memória do paciente. |
| `n8n/no-busca-conhecimento.js` | Gerado por `gerar-n8n.cjs`: colar num Code node antes do nó da IA. |
| `ativo.cjs` | Textos das mensagens ativas, leitura de "1/2/3/SAIR" e travas de envio. |
| `sql/migracao.sql` | Memória do paciente (colunas em `leads`), fila `envios_ativos`, `objecoes_log`, chaves de config. |
| `testes/` | `testar.cjs` (busca), `testar-ativo.cjs` (mensagens) e `testar-contexto.cjs` (datas e conversas antigas). |

## Como entra no n8n (fluxo de TESTE primeiro, nunca direto no real)
1. Backup do workflow e do banco. Rodar `sql/migracao.sql` no Neon.
2. Mensagem chega → **Code "Contexto"** (`contexto.cjs`: últimas mensagens do telefone + `leads` + envio ativo das últimas 48 h; manda para a IA só o histórico do atendimento atual) → **Code "Busca conhecimento"** (este arquivo) → monta prompt com `prompt-base.md`
   (`{{trechos}}` e `{{memoria_paciente}}` = colunas de `leads` do telefone) → IA.
3. Depois da IA: separar o JSON de memória da resposta, gravar em `leads` (nunca mandar o JSON ao paciente);
   se `objecao` veio preenchida, inserir em `objecoes_log`; se `proximo_contato` veio, criar `followup` na fila.
4. As regras atuais do painel (`contexto_ia`) continuam valendo; as que repetem a apostila podem ser desligadas.
5. Testar com o número do Juan as 40 perguntas + conversas de objeção. Só depois, com OK do Ribeiro, copiar para o real.
Trava anti-loop continua: 1 resposta por mensagem, não responde a si mesmo, botão liga/desliga do painel.

## Mensagens ativas (o robô também puxa conversa)
Tudo sai da fila `envios_ativos`. Cada tipo tem chave própria no `config` (começam desligadas).

### Travas anti-bloqueio (obrigatórias em TODO envio automático)
O número está no WAHA (não oficial): nenhuma trava zera o risco, só a API oficial da Meta. Estas fecham tudo que depende de nós:
| Trava | Onde | Valor |
|---|---|---|
| Reativação e campanha só para quem já mandou mensagem para a clínica | `motivoInelegivel` + `ativo_historico()` | contato frio não recebe marketing |
| **Cobrança de boleto não pula ninguém**: envia, adia (recepção atendendo / conversa em andamento) ou manda para a recepção ligar (sem celular, sem WhatsApp, pediu para não receber) | `decidirBoleto`, `ordenarCobranca` | fila do mais atrasado ao mais novo |
| No máximo 1 mensagem automática por paciente por dia (não vale para boleto) | idem | `ativos_hoje` |
| Para quem ignorou as 2 últimas mensagens automáticas (não vale para boleto) | idem | `sem_resposta >= 2` |
| Não interrompe conversa em andamento nem paciente que a recepção assumiu | idem | 12 h / `robo_pausado` |
| Só celular brasileiro válido (55 + DDD + 9 dígitos) | `celularBR` | fixo não recebe |
| Horário: segunda a sábado, 8h às 19h, fora de feriados | `podeEnviar` | `ativo_janela`, `ativo_feriados` |
| Teto por dia e por hora | `podeEnviar` | 30/dia (aquecimento), 10/hora |
| Intervalo ALEATÓRIO entre envios | `intervaloSorteado` → `liberado_em` | 40 a 120 s |
| Disjuntor: 3 falhas de envio → para o dia e avisa | `podeEnviar` | `ativo_max_erros` |
| Boleto sem link no 1º aviso: paciente responde e recebe a 2ª via | `linkNoPrimeiroAviso` | `ativo_boleto_link = resposta` |
| 3 versões de texto por aviso, sorteadas | `TEXTOS` | |
| "SAIR" desliga o paciente para sempre | `lerResposta*` → `aceita_avisos = false` | |
No WAHA, antes de cada envio: conferir se o número tem WhatsApp (`/api/contacts/check-exists`; se não tiver, marcar `pulado`, não enviar)
e mostrar "digitando" por 2 a 4 s (`/api/startTyping`) antes da mensagem. Toda mensagem barrada vira `status = 'pulado'` com `motivo`.

| Tipo | Quando | Fonte | Ação com a resposta |
|---|---|---|---|
| Confirmação de agenda | véspera, 10h | Sigma `GET /agenda/` do dia seguinte, status 0 | 1 → `PUT confirmar`; 2 → robô oferece horários e remarca; 3 → `PUT cancelar` (só depois de repetir os dados) |
| Lembrete do dia | 2 h antes | mesma agenda, já confirmada | — |
| Faltou | dia seguinte, 10h | Sigma `GET /agenda_falta/` | oferece novo horário |
| Follow-up | 24 h e 72 h depois de conversa sem agendamento (máx. 2) | `leads` etapa conversando/orcamento | volta para a conversa normal |
| "Me chama sexta" | data que o paciente pediu | `leads.proximo_contato` | idem |
| Exames pendentes | 2 dias após consulta com exame pedido | recepção marca no painel (Sigma não informa pedido de exame) | agenda coleta |
| Cobrança de boleto | 1 dia antes, no vencimento, 1 a 4 dias depois e uma última com 5 dias ou mais (boleto antigo recebe 1 aviso quando ligar). Para TODOS os boletos em aberto; depois do último, a recepção cobra | Boletos em aberto do Sigma (**endpoint ainda a confirmar com o suporte**) ou planilha da recepção | Nunca negocia: "paguei", desconto, parcelamento ou "sem condições" vão para humano (`lerRespostaBoleto`) |
| Reativação | paciente sem consulta há meses | só quem já conversou com a clínica; máx. 10/dia | **cada envio precisa do OK do Ribeiro** |
| Campanha / repescagem (ex.: Saúde Day) | quando a clínica pedir | só quem já conversou com a clínica | **cada campanha precisa do OK do Ribeiro antes de sair** |

### Boleto: como ligar (nada sai antes disso)
1. Rodar `sql/migracao-boleto.sql` no Neon (libera os tipos novos; chaves nascem desligadas).
2. Descobrir no suporte do Sigma como listar boletos em aberto (telefone, valor, vencimento, link ou linha digitável, situação) e como saber que foi pago.
   Sem API: exportar CSV diário ou a recepção preencher uma planilha. Qualquer fonte serve se virar `{ref, nome, telefone, valor, vencimento, descricao, link, situacao}`.
3. No n8n, um fluxo diário às 9h: para cada boleto, `boletoValido(b)` e `etapaBoleto(b.vencimento, hoje)`; se houver etapa, `montar(etapa, {...})` e inserir em `envios_ativos` com `ref = b.ref`.
   Antes de CADA envio, reconferir na fonte que o boleto continua em aberto.
4. Ligar "Aviso de boleto" no painel só depois de testar com o número do Ribeiro e de um boleto de teste.
Ao inserir na fila, gravar o link do boleto na coluna `link` (a Fátima manda quando o paciente pedir).
Respostas: `lerRespostaBoleto` (nunca `lerResposta`: "não consigo pagar" viraria cancelar consulta). Quem responder SAIR deixa de receber tudo.
Cobrança é dado pessoal sensível ao paciente: sem negociar por WhatsApp, e a clínica precisa estar ciente do envio (LGPD).

### Riscos do WhatsApp (importante)
- O número da clínica está no WhatsApp **não oficial** (WAHA). Confirmação e follow-up para quem já é paciente são de baixo risco
  com as travas acima. Disparo para lista fria ou volume alto pode **bloquear o número**: prospecção em massa só pela API oficial
  da Meta (modelo "marketing" ≈ R$ 0,35 por mensagem; "utilidade", como confirmação, ≈ R$ 0,04).
- Conferir se o Sigma (v2.09) já está mandando confirmação automática pelo WhatsApp: se sim, desligar um dos dois para não duplicar.

## Pendências com a clínica (robô NÃO usa até confirmar)
- Parcelamento de tratamento odontológico ("até 36x no boleto sem entrada e sem juros" da apostila).
- "Vale-hemograma" como isca para quem mora longe: como funciona.
- Retorno gratuito no 2º sábado: vale para todo paciente ou só para quem veio no Saúde Day?
- Próxima data do Saúde Day.
- Desconto à vista: Ribeiro definiu 20% em exames; a apostila começa em 10% e só chega a 20% como última cartada.
  A base segue o Ribeiro (20% direto). Consultas particulares seguem a tabela (10% Pix/dinheiro, 7% cartão).

## Modelo de IA
Manter o modelo atual (z.ai GLM) com a busca: o contexto ficou ~10x menor, que era o que deixava lento e caro.
Só subir de modelo se, no teste das objeções, ele errar regra (preço de odonto, inventar desconto). A troca é só no nó da IA.
