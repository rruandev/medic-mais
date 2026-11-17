-- Robô MedicMais: avisos de boleto, reativação e travas anti-bloqueio do WhatsApp. Rodar uma vez no Neon (depois de migracao.sql).
-- Nada aqui envia mensagem. Só libera os tipos novos, cria a consulta de histórico e grava limites conservadores.
-- Pode rodar de novo sem estragar nada.

-- 1) Tipos novos na fila + status "recepcao" (cobrança que o robô não alcança: a recepção liga) e "pulado" (outras mensagens barradas pela trava)
alter table envios_ativos drop constraint if exists envios_ativos_tipo_check;
alter table envios_ativos add constraint envios_ativos_tipo_check check (tipo in
  ('confirmacao','lembrete_dia','falta','followup','exames','retorno','campanha',
   'reativacao','boleto_antes','boleto_vence','boleto_atraso_1','boleto_atraso_5'));
alter table envios_ativos drop constraint if exists envios_ativos_status_check;
alter table envios_ativos add constraint envios_ativos_status_check check (status in
  ('pendente','aprovado','enviado','respondido','cancelado','erro','pulado','recepcao'));
alter table envios_ativos add column if not exists motivo text;          -- por que foi para a recepção, pulado ou deu erro
alter table envios_ativos add column if not exists liberado_em timestamptz; -- próximo envio só depois disso (intervalo aleatório)
alter table envios_ativos add column if not exists link text;               -- link/linha digitável do boleto: a Fátima manda quando o paciente pedir
create index if not exists envios_ativos_tel on envios_ativos (telefone, enviado_em);

-- 2) Histórico do paciente para a trava (ativo.cjs → motivoInelegivel). Uso no n8n: select * from ativo_historico('5561999990000');
--    ja_conversou   : o paciente já mandou mensagem para o número da clínica (sem isso, reativação/campanha NÃO saem; boleto sai para todos)
--    ativos_hoje    : mensagens automáticas que ele já recebeu hoje (máximo 1 por dia)
--    sem_resposta   : mensagens automáticas enviadas desde a última vez que ele escreveu (2 ou mais = parar)
--    conversa_aberta: ele escreveu nas últimas 12 h (não interromper conversa em andamento)
create or replace function ativo_historico(p_tel text)
returns table (ja_conversou boolean, ativos_hoje int, sem_resposta int, conversa_aberta boolean)
language sql stable as $$
  with ult as (select max(criado_em) as em from mensagens where telefone = p_tel and direcao = 'in')
  select
    (select em from ult) is not null,
    (select count(*)::int from envios_ativos e where e.telefone = p_tel and e.status in ('enviado','respondido')
       and e.enviado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    (select count(*)::int from envios_ativos e where e.telefone = p_tel and e.status in ('enviado','respondido')
       and e.enviado_em > coalesce((select em from ult), '-infinity'::timestamptz)),
    coalesce((select em from ult) > now() - interval '12 hours', false)
$$;

-- 3) Chaves. Boleto e reativação nascem DESLIGADOS.
insert into config (chave, valor) values
  ('ativo_boleto', 'false'),
  ('ativo_reativacao', 'false'),
  ('ativo_limite_reativacao', '10'),   -- reativação: no máximo 10 por dia, e cada lote com OK do Ribeiro
  ('ativo_limite_hora', '10'),         -- no máximo 10 mensagens automáticas por hora
  ('ativo_intervalo_min_s', '40'),     -- intervalo ALEATÓRIO entre envios: 40 a 120 segundos
  ('ativo_intervalo_max_s', '120'),
  ('ativo_max_erros', '3'),            -- 3 falhas de envio → para tudo no dia
  ('ativo_boleto_link', 'resposta'),   -- 'resposta' = link só depois que o paciente responder; 'sempre' = link no 1º aviso
  ('ativo_feriados', '2026-11-20,2026-11-30,2026-12-25,2027-01-01')  -- não envia nesses dias (AAAA-MM-DD, separados por vírgula)
on conflict (chave) do nothing;

-- 4) Teto diário mais baixo no começo (aquecimento do número). Só troca se ainda estiver no valor antigo de 80.
--    Subir aos poucos (30 → 45 → 60) só depois de 2 semanas sem nenhum problema.
update config set valor = '30' where chave = 'ativo_limite_dia' and valor = '80';
