import { q, rota, HttpError } from './_lib.js';

/** Mensagens ativas da Maria (confirmação de consulta, follow-up). O n8n lê as chaves ativo_* da tabela config
    antes de cada envio. Campanha em massa não liga por aqui: cada campanha precisa do OK do Ribeiro. */
const TIPOS = { confirmacao: 'ativo_confirmacao', followup: 'ativo_followup' };

async function ler() {
  const cfg = Object.fromEntries((await q("select chave, valor from config where chave like 'ativo\\_%'")).map((r) => [r.chave, String(r.valor)]));
  let envios = [], hoje = 0;
  try {
    envios = await q(`select id, tipo, nome, telefone, left(texto, 280) as texto, status, agendado_para, enviado_em, resposta
                      from envios_ativos order by coalesce(enviado_em, agendado_para) desc limit 40`);
    const r = await q("select count(*)::int as n from envios_ativos where status in ('enviado','respondido') and enviado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'");
    hoje = r[0] ? r[0].n : 0;
  } catch (e) { /* tabela ainda não criada */ }
  return {
    confirmacao: cfg.ativo_confirmacao === 'true',
    followup: cfg.ativo_followup === 'true',
    campanha: cfg.ativo_campanha === 'true',
    limite_dia: Number(cfg.ativo_limite_dia || 80),
    janela: cfg.ativo_janela || '08:00-19:00',
    enviados_hoje: hoje,
    envios: envios.map((e) => ({ ...e, telefone: String(e.telefone || '').replace(/\d(?=\d{4})/g, '•') }))
  };
}

export default rota({
  GET: ler,
  POST: async ({ body }) => {
    const chave = TIPOS[body.tipo];
    if (!chave) throw new HttpError(400, 'Tipo inválido. Use confirmacao ou followup.');
    if (typeof body.ativo !== 'boolean') throw new HttpError(400, 'Informe ativo: true ou false.');
    await q('insert into config (chave, valor) values ($1, $2) on conflict (chave) do update set valor = excluded.valor', [chave, String(body.ativo)]);
    return ler();
  }
});
