-- Tira do painel/robô os profissionais fictícios da demo (20/10). A lista real vem do Sigma
-- (api/profissionais.js e a agenda já leem do Sigma quando SIGMA_TOKEN está configurado).
update profissionais set ativo = false
 where nome in ('Paulo Mendes', 'Camila Rocha', 'Juliana Alves', 'Beatriz Nunes', 'Renata Castro');
-- Conferir também as regras do "Contexto da IA" que citem esses nomes:
select id, titulo from contexto_ia
 where conteudo ~* '(Paulo Mendes|Camila Rocha|Juliana Alves|Beatriz Nunes|Renata Castro)';
