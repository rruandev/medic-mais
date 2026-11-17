-- Robô MedicMais: avisos de boleto e reativação na fila de mensagens ativas. Rodar uma vez no Neon (depois de migracao.sql).
-- Nada aqui envia mensagem: só libera os novos tipos e cria as chaves (todas DESLIGADAS).

alter table envios_ativos drop constraint if exists envios_ativos_tipo_check;
alter table envios_ativos add constraint envios_ativos_tipo_check check (tipo in
  ('confirmacao','lembrete_dia','falta','followup','exames','retorno','campanha',
   'reativacao','boleto_antes','boleto_vence','boleto_atraso_1','boleto_atraso_5'));

-- ref do boleto = id do boleto no Sigma (ou linha da planilha): a restrição unique (tipo, telefone, ref, tentativa) impede aviso repetido.

insert into config (chave, valor) values
  ('ativo_boleto', 'false'),
  ('ativo_reativacao', 'false'),
  ('ativo_limite_reativacao', '15')   -- teto de reativações por dia (cada campanha ainda precisa de aprovação)
on conflict (chave) do nothing;
