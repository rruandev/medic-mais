import { rota, HttpError, normalizaTelefone, n8nBase } from './_lib.js';

/** Envia mensagem pelo WhatsApp via n8n (o n8n envia e grava a mensagem 'out'). */
export default rota({
  POST: async ({ body }) => {
    const telefone = normalizaTelefone(body.telefone);
    const texto = String(body.texto || '').trim();
    if (!texto) throw new HttpError(400, 'Escreva a mensagem antes de enviar.');
    if (texto.length > 2000) throw new HttpError(400, 'Mensagem longa demais (máximo de 2000 caracteres).');

    const base = await n8nBase();
    if (!base) {
      throw new HttpError(503, 'O envio pelo WhatsApp ainda não está ligado neste painel (falta configurar o endereço do n8n). Avise a equipe técnica.');
    }
    let r;
    try {
      r = await fetch(`${base}/webhook/painel/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-painel-token': process.env.PAINEL_TOKEN || '' },
        body: JSON.stringify({ telefone, texto }),
        signal: AbortSignal.timeout(12000)
      });
    } catch {
      throw new HttpError(503, 'Não consegui falar com o atendente de WhatsApp (n8n fora do ar ou sem resposta). Tente de novo em instantes.');
    }
    if (!r.ok) {
      throw new HttpError(503, `O atendente de WhatsApp recusou o envio (código ${r.status}). Confira se o fluxo do n8n está ativo.`);
    }
    return { ok: true };
  }
});
