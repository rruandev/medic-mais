-- Robô MedicMais: memória do paciente + mensagens ativas (Neon). Rodar uma vez; tudo é "if not exists".
-- Nada aqui envia mensagem: só cria onde guardar.

-- 1) Memória do paciente (completa a tabela leads que já existe)
alter table leads add column if not exists robo_pausado boolean not null default false; -- botão Assumir conversa do painel: true = robô não responde
alter table leads add column if not exists dor text;
alter table leads add column if not exists impacto text;
alter table leads add column if not exists ha_quanto_tempo text;
alter table leads add column if not exists outra_clinica text;
alter table leads add column if not exists especialidade text;
alter table leads add column if not exists convenio text;
alter table leads add column if not exists ultima_objecao text;
alter table leads add column if not exists proximo_contato timestamptz;          -- "me chama sexta" → follow-up marcado
alter table leads add column if not exists aceita_avisos boolean default true;   -- false = pediu para não receber (SAIR)
alter table leads add column if not exists cpf_final text;                        -- só os 3 últimos dígitos, para conferência

-- 2) Fila de mensagens ativas (confirmação, follow-up, campanhas)
create table if not exists envios_ativos (
  id            bigserial primary key,
  tipo          text not null check (tipo in ('confirmacao','lembrete_dia','falta','followup','exames','retorno','campanha')),
  telefone      text not null,
  nome          text,
  texto         text not null,
  ref           text,                 -- idagenda do Sigma, id da campanha etc. (evita repetir)
  agendado_para timestamptz not null default now(),
  status        text not null default 'pendente' check (status in ('pendente','aprovado','enviado','respondido','cancelado','erro')),
  precisa_aprovar boolean not null default true,  -- campanhas sempre true; confirmação vira false depois do teste aprovado
  tentativa     int not null default 1,
  enviado_em    timestamptz,
  resposta      text,
  criado_em     timestamptz not null default now(),
  unique (tipo, telefone, ref, tentativa)
);
create index if not exists envios_ativos_fila on envios_ativos (status, agendado_para);

-- 3) Objeções (para o relatório "o que mais trava a venda" e calibração com a clínica)
create table if not exists objecoes_log (
  id bigserial primary key,
  telefone text not null,
  tipo text not null,
  mensagem text,
  virou_agendamento boolean,
  criado_em timestamptz not null default now()
);

-- 4) Configuração das mensagens ativas (painel liga/desliga cada tipo)
insert into config (chave, valor) values
  ('ativo_confirmacao', 'false'),
  ('ativo_followup', 'false'),
  ('ativo_campanha', 'false'),
  ('ativo_limite_dia', '80'),         -- teto de mensagens ativas por dia (WhatsApp não oficial)
  ('ativo_janela', '08:00-19:00')     -- só envia nesse horário, de segunda a sábado
on conflict (chave) do nothing;
