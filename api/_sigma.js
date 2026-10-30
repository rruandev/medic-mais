import { HttpError } from './_lib.js';

/* Leitura da agenda real da clínica no Sigma (SoftClínica), unidade de Sobradinho.
   O token fica só na variável de ambiente SIGMA_TOKEN; nunca vai para o navegador nem para logs.
   Sem SIGMA_TOKEN o painel continua usando as tabelas do Neon, como antes. */

const BASE = (process.env.SIGMA_URL || 'https://medicmais.sigmacloud.com.br/med_0029/ws').replace(/\/+$/, '');
const IGNORAR = new Set(String(process.env.SIGMA_IGNORAR || '66,76').split(',').map((s) => s.trim()).filter(Boolean)); // LABORATÓRIO e FINANCEIRO não são profissionais
const CORES = ['#2563EB', '#DC2626', '#16A34A', '#F59E0B', '#9333EA', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5'];
const TTL = 60000;

export const sigmaAtivo = () => !!process.env.SIGMA_TOKEN;

const _cache = new Map();

async function get(recurso, params) {
  const url = new URL(`${BASE}/${recurso}/`);
  url.searchParams.set('token', process.env.SIGMA_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
  } catch (e) {
    console.error('Sigma: falha de rede em', recurso, e && e.name);
    throw new HttpError(502, 'Não consegui falar com o sistema da clínica (Sigma). Tente de novo em instantes.');
  }
  let j = null;
  try { j = await r.json(); } catch { /* resposta não-JSON */ }
  if (!j) { console.error('Sigma: resposta inválida em', recurso, r.status); throw new HttpError(502, 'O sistema da clínica (Sigma) respondeu de um jeito inesperado.'); }
  if (j.bErro) {
    // "nenhum registro" não é erro para o painel: só não há horários no período
    if (/nenhum registro/i.test(j.msgErro || '')) return null;
    console.error('Sigma: erro em', recurso, r.status, j.msgErro);
    throw new HttpError(502, 'O sistema da clínica (Sigma) recusou a consulta: ' + String(j.msgErro || 'erro desconhecido'));
  }
  return j.data;
}

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const capitaliza = (s) => String(s || '').toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase());

/** "DRª KAYLANE MAIA - DENTISTA" → { titulo: 'Dra.', nome: 'Kaylane Maia' } */
function nomeProfissional(bruto) {
  let s = String(bruto || '').replace(/\s+-\s+.*$/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
  let titulo = '';
  const m = s.match(/^(dr[aª]?|dra)[.º°]?\s+/i);
  if (m) { titulo = /a|ª/i.test(m[1].slice(2)) ? 'Dra.' : 'Dr.'; s = s.slice(m[0].length); }
  return { titulo, nome: capitaliza(s) || 'Profissional' };
}

/** Situação do Sigma → situação do painel. 'livre' e 'bloqueado' não são consultas. */
function situacao(h) {
  const t = semAcento(h.status);
  if (t.includes('livre')) return 'livre';
  if (t.includes('cancelado')) return h.paciente && h.paciente.idpaciente ? 'cancelado' : 'bloqueado';
  if (t.includes('desmarcou') || t.includes('reagendou')) return 'cancelado';
  if (t.includes('faltou') || t.includes('nao atendido')) return 'faltou';
  if (t.includes('ja atendido') || t.includes('em atendimento') || t === 'compareceu') return 'atendido';
  return String(h.confirmado || '').toUpperCase() === 'S' ? 'confirmado' : 'agendado';
}

const toMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/**
 * Agenda do Sigma entre duas datas (AAAA-MM-DD), já no formato do painel.
 * Devolve { profissionais, agendamentos, horarios } — horarios inclui livres, para medir ocupação.
 * CPF nunca sai daqui.
 */
export async function agendaSigma(inicio, fim) {
  const chave = inicio + '|' + fim;
  const c = _cache.get(chave);
  if (c && Date.now() - c.t < TTL) return c.v;

  const data = await get('agenda', { dataini: inicio, datafin: fim, status: '0,1,2,3,4,5,6,7,8,9,10' });
  const medicos = (data && data.medicos ? data.medicos : []).flat().filter((m) => m && !IGNORAR.has(String(m.id)));
  medicos.sort((a, b) => Number(a.id) - Number(b.id));

  const profissionais = [], agendamentos = [], horarios = [];
  medicos.forEach((m, i) => {
    const { titulo, nome } = nomeProfissional(m.nome);
    const esp = (m.especialidades || [])[0];
    const p = { id: Number(m.id), titulo, nome, especialidade: esp ? capitaliza(esp.descricao) : '', servico: '', cor: CORES[i % CORES.length] };
    profissionais.push(p);
    for (const d of m.dias || []) {
      const hs = (d.horario || []).filter((h) => /^\d{2}:\d{2}/.test(h.hora || '')).sort((a, b) => a.hora.localeCompare(b.hora));
      // duração = menor intervalo entre horários do dia (padrão 30 min)
      let dur = 0;
      for (let k = 1; k < hs.length; k++) { const g = toMin(hs[k].hora) - toMin(hs[k - 1].hora); if (g > 0 && (!dur || g < dur)) dur = g; }
      dur = Math.min(120, Math.max(10, dur || 30));
      for (const h of hs) {
        const st = situacao(h), hora = h.hora.slice(0, 5);
        horarios.push({ profissional_id: p.id, data: d.dia, hora, duracao_min: dur, situacao: st });
        if (st === 'livre' || st === 'bloqueado') continue;
        const motivo = capitaliza(h.motivo || 'Consulta');
        agendamentos.push({
          id: 's' + h.idagenda, origem: 'sigma', lead_id: null, etapa: null,
          nome: capitaliza((h.paciente && h.paciente.nome) || 'Paciente'), telefone: '',
          servico: 'sigma-' + (h.idmotivo || '0'), servico_nome: motivo, duracao_min: dur,
          data: d.dia, hora, status: st, criado_em: null,
          profissional: { id: p.id, titulo: p.titulo, nome: p.nome, especialidade: p.especialidade, cor: p.cor }
        });
      }
    }
  });
  agendamentos.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const v = { profissionais, agendamentos, horarios };
  _cache.set(chave, { t: Date.now(), v });
  if (_cache.size > 50) _cache.delete(_cache.keys().next().value);
  return v;
}

/** Motivos do Sigma no formato de "serviço" do painel (para cores e rótulos). */
export function servicosSigma(agendamentos) {
  const vistos = new Map();
  for (const a of agendamentos) if (!vistos.has(a.servico)) vistos.set(a.servico, { chave: a.servico, nome: a.servico_nome, duracao_min: a.duracao_min, capacidade: 1, dias_semana: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '20:00' });
  return [...vistos.values()];
}

export const ATIVO = (st) => st === 'agendado' || st === 'confirmado' || st === 'atendido';
