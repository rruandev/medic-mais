# Painel na VPS Hostinger

Sobe com `server.js` (Node 22, sem build) em container Docker. Mesmo código da Vercel.

Variáveis (arquivo `.env` na VPS, nunca no Git): `DATABASE_URL`, `PAINEL_TOKEN`, `SIGMA_URL`, `SIGMA_TOKEN`, `SIGMA_IGNORAR`,
`N8N_URL_LOCAL` (ex.: `http://n8n-atendente:5678`, rede Docker dos robôs).

Compose: serviço `painel` (build deste repo, porta 3000 interna) e bloco no Caddy apontando o domínio para `painel:3000`.
