import { q, rota, HttpError } from './_lib.js';

/** Liga/desliga geral do robô do WhatsApp. O n8n lê a chave 'robo_ativo' da tabela config a cada mensagem:
    desligado = a mensagem do paciente é gravada e aparece aqui, mas o robô não responde. Sem a linha, vale ligado. */
const ler = async () => {
  const r = await q("select valor from config where chave = 'robo_ativo'");
  return { ativo: !(r[0] && String(r[0].valor) === 'false') };
};

export default rota({
  GET: ler,
  POST: async ({ body }) => {
    if (typeof body.ativo !== 'boolean') throw new HttpError(400, 'Informe ativo: true ou false.');
    await q("insert into config (chave, valor) values ('robo_ativo', $1) on conflict (chave) do update set valor = excluded.valor", [String(body.ativo)]);
    return ler();
  }
});
