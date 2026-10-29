import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

let _sql;
export function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new HttpError(500, 'Banco de dados não configurado no servidor (DATABASE_URL ausente).');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
export const q = (text, params = []) => sql().query(text, params);

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

/** Endereço do n8n: lido da tabela config (chave 'n8n_url', cache de 30 s) para o túnel poder mudar sem republicar; N8N_URL só como reserva. */
let _n8n = { v: null, t: 0 };
export async function n8nBase() {
  if (process.env.N8N_URL_LOCAL) return process.env.N8N_URL_LOCAL.replace(/\/+$/, ''); /* só para testes locais; não existe em produção */
  if (Date.now() - _n8n.t < 30000) return _n8n.v;
  let v = '';
  try {
    const r = await q("select valor from config where chave = 'n8n_url'");
    v = (r[0] && r[0].valor ? String(r[0].valor) : '').trim();
  } catch (e) { /* tabela ausente ou banco fora: cai no fallback */ }
  if (!/^https?:\/\//i.test(v)) v = (process.env.N8N_URL || '').trim();
  _n8n = { v: v.replace(/\/+$/, ''), t: Date.now() };
  return _n8n.v;
}

export function tokenOk(req) {
  const esperado = process.env.PAINEL_TOKEN;
  if (!esperado) throw new HttpError(500, 'Token do painel não configurado no servidor (PAINEL_TOKEN ausente).');
  const recebido = String(req.headers['x-painel-token'] || '');
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cria o handler da rota: auth por token + despacho por método + tratamento de erro padronizado. */
export function rota(metodos) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const enviar = (status, corpo) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(corpo)); };
    try {
      if (!tokenOk(req)) throw new HttpError(401, 'Token inválido.');
      const fn = metodos[req.method];
      if (!fn) { res.setHeader('Allow', Object.keys(metodos).join(', ')); throw new HttpError(405, 'Método não permitido.'); }
      const url = new URL(req.url, 'http://x');
      const query = Object.fromEntries(url.searchParams);
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Corpo da requisição não é um JSON válido.'); } }
      const out = await fn({ req, query, body: body || {} });
      if (Array.isArray(out) && typeof out[0] === 'number') return enviar(out[0], out[1]);
      return enviar(200, out);
    } catch (e) {
      if (e instanceof HttpError) return enviar(e.status, { erro: e.message, ...(e.extra || {}) });
      console.error('Erro na rota', req.method, req.url, e && e.message);
      return enviar(500, { erro: 'Erro interno ao falar com o banco de dados. Tente de novo em instantes.' });
    }
  };
}

/* ---------- utilidades ---------- */
export const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
export const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const STATUS = ['agendado', 'confirmado', 'atendido', 'cancelado', 'faltou'];
export const ETAPAS = ['novo_contato', 'qualificado', 'horario_oferecido', 'agendado', 'confirmado'];
export const ATIVOS = "('cancelado','faltou')"; // não ocupam vaga

export function dataValida(s) {
  if (!RE_DATA.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function idValido(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw new HttpError(400, 'Identificador inválido.');
  return n;
}
export function normalizaTelefone(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!/^55\d{10,11}$/.test(d)) throw new HttpError(400, 'Telefone inválido. Use DDD + número, por exemplo (61) 99999-0000.');
  return d;
}
export async function hojeSP() {
  const r = await q("select to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') d, to_char(now() at time zone 'America/Sao_Paulo','HH24:MI') h");
  return r[0];
}

const COLS_AG = `a.id, a.lead_id, a.nome, a.telefone, a.servico, coalesce(s.nome, a.servico) as servico_nome,
  coalesce(s.duracao_min, 30) as duracao_min, to_char(a.data,'YYYY-MM-DD') as data, to_char(a.hora,'HH24:MI') as hora,
  a.status, a.criado_em,
  case when p.id is null then null else json_build_object('id', p.id, 'titulo', p.titulo, 'nome', p.nome, 'especialidade', p.especialidade, 'cor', p.cor) end as profissional`;
const PROF_DE_SERVICO = "(select id from profissionais x where x.servico = $SV and x.ativo order by x.id limit 1)";
const FROM_AG = `from agendamentos a left join servicos s on s.chave = a.servico
  left join profissionais p on p.id = coalesce(a.profissional_id, (select id from profissionais x where x.servico = a.servico and x.ativo order by x.id limit 1))`;
export { COLS_AG, FROM_AG, PROF_DE_SERVICO };

export async function agendamentoPorId(id) {
  const r = await q(`select ${COLS_AG} ${FROM_AG} where a.id = $1`, [id]);
  return r[0] || null;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Valida regra de funcionamento e capacidade do serviço para um horário.
 * Lança HttpError 400/409/422 com mensagem pronta para a recepção.
 */
export async function validarHorario({ servico, data, hora, ignorarId = null, telefone = null }) {
  if (!dataValida(data)) throw new HttpError(400, 'Data inválida. Use o formato AAAA-MM-DD.');
  if (!RE_HORA.test(hora || '')) throw new HttpError(400, 'Hora inválida. Use o formato HH:MM.');
  const sv = (await q('select chave, nome, duracao_min, capacidade, dias_semana, to_char(inicio,\'HH24:MI\') inicio, to_char(fim,\'HH24:MI\') fim from servicos where chave = $1', [servico]))[0];
  if (!sv) throw new HttpError(400, 'Serviço desconhecido. Escolha um serviço da lista.');
  const [y, m, d] = data.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dom
  const iso = dow === 0 ? 7 : dow;
  if (!(sv.dias_semana || []).includes(iso)) throw new HttpError(422, `${sv.nome} não é atendido no(a) ${DIAS[dow]}. Escolha outro dia.`);
  const fim = iso === 6 && sv.fim > '12:00' ? '12:00' : sv.fim; // sábado fecha às 12h
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  if (toMin(hora) < toMin(sv.inicio) || toMin(hora) + sv.duracao_min > toMin(fim)) {
    throw new HttpError(422, `Fora do horário de atendimento de ${sv.nome}: ${sv.inicio} às ${fim}${iso === 6 ? ' aos sábados' : ''} (a consulta dura ${sv.duracao_min} min).`);
  }
  const hoje = await hojeSP();
  if (data < hoje.d) throw new HttpError(422, 'Essa data já passou. Escolha hoje ou uma data futura.');
  const base = `from agendamentos where servico = $1 and data = $2::date and status not in ${ATIVOS}
    and ($4::int is null or id <> $4)
    and hora < ($3::time + make_interval(mins => $5)) and (hora + make_interval(mins => $5)) > $3::time`;
  const params = [servico, data, hora, ignorarId, sv.duracao_min];
  if (telefone) {
    const dup = await q(`select count(*)::int c ${base} and telefone = $6`, [...params, telefone]);
    if (dup[0].c > 0) throw new HttpError(409, 'Esse paciente já tem esse serviço marcado nesse mesmo horário.');
  }
  const r = await q(`select count(*)::int c ${base}`, params);
  if (r[0].c >= sv.capacidade) {
    throw new HttpError(409, sv.capacidade > 1
      ? `Horário lotado: ${sv.nome} comporta ${sv.capacidade} pacientes ao mesmo tempo. Escolha outro horário.`
      : `Horário já ocupado para ${sv.nome}. Escolha outro horário.`);
  }
  return { sv };
}

