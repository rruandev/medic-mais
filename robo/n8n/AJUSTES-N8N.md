# Ajustes no fluxo do n8n da Fátima (18/11/2026)

O fluxo do robô fica no n8n da VPS, não neste repositório. Estes são os ajustes que tiram a Fátima do "chama humano toda hora"
e protegem o número contra banimento. **Faça primeiro no fluxo de TESTE, com backup do workflow (⋯ → Download).**

Tabela usada: `mensagens (id, telefone, direcao 'in'|'out', origem, texto, midia_tipo, midia_arquivo, criado_em)`.

---

## 1. Prompt da Fátima (nó da IA)
Copie para o prompt do nó da IA as partes novas de `robo/prompt-base.md`:
- parte 1: responder várias mensagens seguidas numa resposta só;
- parte 2: blocos **REMARCAR OU CANCELAR** e **CONSULTA QUE JÁ EXISTE**;
- parte 4: especialidade de cada profissional + nomes escritos errado ("Hemily" = Hemilly);
- partes 5 e 8: tentar as ferramentas antes de chamar humano, lista fechada de motivos e a frase nova
  (sem "já te retorno").

Por quê: o prompt mandava "diga *Vou confirmar com a equipe e já te retorno* e chame humano" sempre que faltava algo,
e mandava confirmar com a equipe todo nome de profissional que ela não achava. Como os pacientes escrevem
"Hemily/Emily/Emilly", ela não achava a Hemilly e chamava humano.

---

## 2. Juntar mensagens seguidas (acaba com resposta duplicada)
Hoje cada mensagem do paciente dispara uma resposta. Quem manda "Bom dia" + "Quero remarcar" recebe duas respostas.

Logo **depois do nó que grava a mensagem 'in'** (faça esse insert terminar com `returning id`):

1. Nó **Wait**: 12 segundos.
2. Nó **Postgres** "Chegou outra?" (parâmetro `$1` = telefone):
   ```sql
   select
     (select max(id) from mensagens where telefone = $1 and direcao = 'in') as ultima_in_id,
     (select string_agg(texto, E'\n' order by id) from mensagens
       where telefone = $1 and direcao = 'in'
         and id > coalesce((select max(id) from mensagens where telefone = $1 and direcao = 'out'), 0)) as textos_juntos;
   ```
3. Nó **IF**: `{{ $json.ultima_in_id }}` é igual ao `id` gravado no passo anterior?
   - **Sim** → segue para a IA usando `textos_juntos` como a mensagem do paciente.
   - **Não** → para aqui (chegou mensagem mais nova; a execução dela responde tudo junto).

---

## 3. Mensagem que a recepção manda pelo celular (`fromMe`)
Hoje, quando alguém da clínica escreve direto no WhatsApp, a mensagem é gravada como se fosse do paciente
e a Fátima responde por cima (ex.: final 4004, "Me confirma o CPF para que eu possa emitir a nota").

Logo **depois do Webhook do WAHA**, nó **Code**:
```js
const p = $json.body?.payload || $json.payload || {};
const deMim = p.fromMe === true;
// Mensagem enviada pelo próprio número: o paciente é o destinatário (to), não o remetente (from).
const chat = String((deMim ? p.to : p.from) || '').replace(/@.*$/, '');
return [{ json: { ...$json, de_mim: deMim, telefone_chat: chat, texto_recebido: p.body || '' } }];
```
Nó **IF** `de_mim`:
- **Não** → fluxo normal.
- **Sim** → nó **Postgres** "É eco da Fátima?":
  ```sql
  select 1 from mensagens where telefone = $1 and direcao = 'out' and texto = $2 and criado_em > now() - interval '2 minutes' limit 1;
  ```
  - achou → é a própria Fátima (ou o painel): **ignora**.
  - não achou → é a recepção pelo celular:
    ```sql
    insert into mensagens (telefone, direcao, origem, texto) values ($1, 'out', 'recepcao', $2);
    update leads set robo_pausado = true, atualizado_em = now() where telefone = $1;
    ```
    e **não chama a IA**. A conversa fica como "Você assumiu" no painel; para a Fátima voltar, é o botão
    **Devolver ao robô**.

---

## 4. Trava antibanimento contando só o que a Fátima envia
A trava de 12 (agora 30) mensagens em 10 min contava as mensagens do paciente também, e parou a Luana no meio do cancelamento.
Troque a contagem por:
```sql
select count(*)::int as enviadas from mensagens
where telefone = $1 and direcao = 'out' and coalesce(origem, 'ia') = 'ia'
  and criado_em > now() - interval '10 minutes';
```
Limite sugerido: **15 respostas da Fátima em 10 min** por paciente. Com o ajuste 2 (juntar mensagens) ela manda bem menos.
Quando a trava disparar no meio de uma ação (marcar/cancelar), o aviso para a recepção continua dizendo qual ação ficou pendente.

---

## 5. Erro da IA ("erro_ia") com nova tentativa
No nó da IA → **Settings**:
- **Retry On Fail**: ligado · **Max Tries**: 3 · **Wait Between Tries**: 3000 ms.
- **On Error**: *Continue (using error output)* → nó Postgres que grava o erro antes da mensagem padrão:
  ```sql
  create table if not exists erros_robo (id bigserial primary key, telefone text, erro text, criado_em timestamptz default now());
  insert into erros_robo (telefone, erro) values ($1, left($2, 2000));
  ```
Assim um soluço da API não vira "alguém da equipe continua" e, quando falhar de verdade, fica registrado o motivo.

---

## 6. Áudio transcrito mesmo com o robô pausado
Quando a conversa está em "Pediu humano" ou "Você assumiu", o áudio chega como "[O paciente enviou um áudio (veja no painel)]".
Mova o passo de **transcrição** para **antes** da checagem de `robo_ativo` / `robo_pausado` / `precisa_humano`:
a mensagem é gravada já transcrita e só a resposta da IA é que fica bloqueada.

---

## 7. "Só consigo marcar uma consulta por vez"
Procure no n8n (Ctrl+F nos nós de agendamento e no prompt) por "uma consulta" / "por vez".
- Se for regra do fluxo: bloqueie só quando for **o mesmo profissional no mesmo dia**; com outro profissional, deixe marcar.
- Se for o **Sigma** devolvendo erro ao marcar a 2ª consulta, copie a mensagem de erro do Sigma: aí a trava é do sistema
  da clínica e precisa ser ajustada no Sigma.

---

## Ordem sugerida
1 (prompt) → 2 (juntar) → 3 (fromMe) → 4 (trava) → 5 (erro) → 6 (áudio) → 7.
Depois de cada um: testar com o número de teste, olhar as conversas no painel e só então copiar para o fluxo real.
