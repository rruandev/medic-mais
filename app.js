/* Painel da recepção · MedicMais Sobradinho
   Sem build. Fala com /api/* (mesma origem). ?demo=1 usa dados fictícios em memória, sem rede. */
(function () {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const DEMO = qs.get('demo') === '1';
  const TZ = 'America/Sao_Paulo';
  const POLL_MS = 5000;
  const $ = (id) => document.getElementById(id);

  const ETAPAS = [
    { id: 'novo_contato', nome: 'Novo contato', cor: '#F2B8BB' },
    { id: 'qualificado', nome: 'Qualificado', cor: '#EB8E93' },
    { id: 'horario_oferecido', nome: 'Horário oferecido', cor: '#E2565C' },
    { id: 'agendado', nome: 'Agendado', cor: '#D9161D' },
    { id: 'confirmado', nome: 'Confirmado', cor: '#8E1016' }
  ];
  const ETAPA_NOME = Object.fromEntries(ETAPAS.map((e) => [e.id, e.nome]));
  const STATUS_NOME = { agendado: 'Agendado', confirmado: 'Confirmado', atendido: 'Atendido', cancelado: 'Cancelado', faltou: 'Faltou' };
  const NAV = [
    { id: 'dashboard', nome: 'Painel', icon: 'i-dash' },
    { id: 'agenda', nome: 'Agenda', icon: 'i-cal' },
    { id: 'conversas', nome: 'Conversas', icon: 'i-chat' },
    { id: 'funil', nome: 'Funil', icon: 'i-funnel' }
  ];
  /* grade da agenda */
  const HH = 56, START = 480, END = 1080, ROWS = (END - START) / 30;

  /* ---------- utilidades ---------- */
  const store = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { /* storage bloqueado: segue sem persistir */ }
    return null;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function nowSP() {
    const p = {};
    dtf.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { d: `${p.year}-${p.month}-${p.day}`, h: `${p.hour}:${p.minute}`, min: +p.hour * 60 + +p.minute };
  }
  const toD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = (s) => toD(s).getUTCDay();
  const monday = (s) => { const w = dow(s); return addDays(s, w === 0 ? 1 : 1 - w); }; /* domingo mostra a semana seguinte */
  const fmtLong = (s) => toD(s).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const fmtMonthDay = (s) => toD(s).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
  const fmtDM = (s) => s.slice(8) + '/' + s.slice(5, 7);
  const WD3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const WDLONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const toMin = (h) => +h.slice(0, 2) * 60 + +h.slice(3, 5);
  const fmtMin = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const tfmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const timeSP = (iso) => tfmt.format(new Date(iso));
  const daySP = (iso) => { const p = {}; dtf.formatToParts(new Date(iso)).forEach((x) => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day}`; };
  function ago(iso) {
    const t = new Date(iso).getTime();
    if (!iso || isNaN(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'agora';
    if (m < 60) return 'há ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return 'há ' + h + ' h';
    const d = Math.round(h / 24);
    return 'há ' + d + (d === 1 ? ' dia' : ' dias');
  }
  function fmtPhone(t) {
    let d = String(t || '').replace(/\D/g, '');
    if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return t || '';
  }
  const maskPhone = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const ORIGEM = { paciente: 'Paciente', ia: 'Maria · IA', recepcao: 'Recepção · humano' };
  const origemDe = (m) => (m.direcao === 'in' ? 'paciente' : (ORIGEM[m.origem] && m.origem !== 'paciente' ? m.origem : 'ia'));
  function midia(texto) {
    const t = String(texto || '');
    let m = t.match(/^\[(?:Áudio|Audio)[^\]]*\]:?\s*([\s\S]*)$/i);
    if (m) return { tipo: 'audio', rotulo: 'Áudio', txt: m[1].trim() };
    m = t.match(/^\[Foto[^\]]*\]:?\s*([\s\S]*)$/i);
    if (m) return { tipo: 'foto', rotulo: 'Foto', txt: m[1].trim() };
    return null;
  }
  const TIPO_EMOJI = { audio: '🎤 Áudio', imagem: '📷 Foto', video: '🎬 Vídeo' };
  const previa = (texto, tipo) => { const md = midia(texto); if (md) return (md.tipo === 'audio' ? '🎤 Áudio: ' : '📷 Foto: ') + md.txt; if (!String(texto || '').trim() && tipo) return TIPO_EMOJI[tipo] || ''; return texto || ''; };
  const corpoMsg = (texto) => { const md = midia(texto); return md ? `<span class="midia ${md.tipo}"><span class="mi">${icon(md.tipo === 'audio' ? 'i-mic' : 'i-cam')}${md.rotulo}</span><em>${esc(md.txt || '(sem conteúdo)')}</em></span>` : esc(texto); };
  const origemTag = (o, cls) => `<span class="${cls || 'dir'} o-${o}">${o === 'recepcao' ? icon('i-user') : ''}${ORIGEM[o]}</span>`;
  const initials = (n) => String(n || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';
  const nomeOuFone = (nome, tel) => (nome && nome.trim()) || fmtPhone(tel);
  const primeiroNome = (n) => String(n || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || '';
  const pCor = (p) => (p && /^#[0-9a-f]{6}$/i.test(p.cor) ? p.cor : '#686C6E');
  const pStyle = (p) => `--sv:${pCor(p)};--svt:color-mix(in srgb, ${pCor(p)} 14%, #fff)`;
  const profLabel = (p) => (p ? `${p.titulo} ${p.nome}` : '');
  const profCurto = (p) => (p ? `${p.titulo} ${p.nome.split(' ')[0]}` : '');
  const profDeServico = (chave) => (S.profs || []).find((p) => p.servico === chave) || null;
  const profDeAg = (a) => a.profissional || profDeServico(a.servico);
  const agStyle = (a) => pStyle(profDeAg(a));

  const sess = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } return null; };
  const getToken = () => store('painel_token') || sess('painel_token') || '';
  const setToken = (t, manter) => { store('painel_token', manter ? t : null); sess('painel_token', manter ? null : t); };
  const clearToken = () => { store('painel_token', null); sess('painel_token', null); };

  /* ---------- estado ---------- */
  const S = {
    started: false, view: 'dashboard', tick: 0, humano: 0,
    resumo: null, servicos: null, profs: null, leads: null, conversas: null,
    agenda: { mode: window.innerWidth < 768 ? 'dia' : 'semana', ref: nowSP().d, data: null, showCanc: false, scrolled: false, prof: 'todos' },
    chat: { tel: null, lead: null, mensagens: null, pend: [], sig: '' },
    funilTab: 'funil', ctx: null, ctxEdit: null, ctxDel: null, filtro: 'todas', busca: '', sig: {}, inflight: {}, erro: {}, drag: null
  };

  /* ---------- rede ---------- */
  class ApiError extends Error {
    constructor(status, msg, net) { super(msg); this.status = status; this.net = !!net; }
  }
  async function api(method, path, body) {
    if (DEMO) return demo.handle(method, path, body);
    let r;
    try {
      r = await fetch(path, {
        method,
        headers: { 'x-painel-token': getToken(), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new ApiError(0, 'Sem conexão com o servidor.', true); }
    let j = null;
    try { j = await r.json(); } catch (e) { /* sem corpo */ }
    if (r.status === 401) { sessaoExpirou(); throw new ApiError(401, 'Token inválido.'); }
    if (!r.ok) throw new ApiError(r.status, (j && j.erro) || `Erro ${r.status} no servidor.`);
    return j;
  }
  const msgErro = (e) => (e && e.net ? 'Sem conexão. Confira a internet e tente de novo.' : (e && e.message) || 'Algo deu errado. Tente de novo.');

  /* ---------- toasts e modal ---------- */
  function toast(msg, tipo) {
    const t = document.createElement('div');
    t.className = 'toast ' + (tipo || 'ok');
    t.innerHTML = (tipo === 'err' ? icon('i-alert') : icon('i-check')) + `<span>${esc(msg)}</span>`;
    $('toasts').appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, tipo === 'err' ? 5200 : 3200);
  }
  let lastFocus = null, modalOnClose = null;
  function openModal(title, html, opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    document.querySelector('.modal-box').classList.toggle('wide', !!opts.wide);
    $('modal').hidden = false;
    document.body.style.overflow = 'hidden';
    modalOnClose = opts.onClose || null;
    const f = $('modal-body').querySelector('[autofocus],input:not([type=checkbox]),select,textarea,button.btn-primary');
    setTimeout(() => (f && window.innerWidth > 640 ? f : document.querySelector('.modal-box')).focus(), 30);
  }
  function closeModal() {
    if ($('modal').hidden) return;
    $('modal').hidden = true; $('modal-body').innerHTML = '';
    document.body.style.overflow = '';
    if (modalOnClose) modalOnClose();
    modalOnClose = null;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* elemento removido */ } }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  /* ---------- sessão ---------- */
  function showLogin(msg) {
    S.started = false; AL.pend = []; AL.ids = null; if (typeof renderBar === 'function') renderBar();
    $('app').hidden = true; $('login').hidden = false;
    $('token').value = '';
    const er = $('login-error'); er.hidden = !msg; er.textContent = msg || '';
    setTimeout(() => $('token').focus(), 50);
  }
  function sessaoExpirou() {
    if (DEMO || $('app').hidden) return;
    clearToken();
    closeModal();
    showLogin('Token inválido ou expirado. Peça o token atual à equipe técnica e entre de novo.');
  }
  function setLive(ok) {
    ['live', 'live-m'].forEach((id) => $(id).classList.toggle('off', !ok));
    const txt = DEMO ? 'demonstração' : ok ? 'ao vivo' : 'sem conexão';
    $('live-text').textContent = txt; $('live-text-m').textContent = txt;
    $('error-box').hidden = ok || DEMO;
  }

  /* ---------- navegação ---------- */
  function renderNav() {
    const hum = S.humano;
    $('side-nav').innerHTML = NAV.map((n) => `<button type="button" class="nav-item" data-nav="${n.id}"${S.view === n.id ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.nome}</span>${n.id === 'conversas' && hum ? `<span class="nbadge" title="Pedidos de atendimento humano">${hum}</span>` : ''}</button>`).join('');
    $('tabbar').innerHTML = NAV.map((n) => `<button type="button" class="tab" data-nav="${n.id}"${S.view === n.id ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.nome}</span>${n.id === 'conversas' && hum ? `<span class="nbadge">${hum}</span>` : ''}</button>`).join('');
  }
  function setHumano(n) { if (n !== S.humano) { S.humano = n; renderNav(); } }

  function showView(id, opts) {
    opts = opts || {};
    if (!NAV.some((n) => n.id === id)) id = 'dashboard';
    S.view = id;
    NAV.forEach((n) => { $('v-' + n.id).hidden = n.id !== id; });
    if (!opts.noHash) { try { history.replaceState(null, '', location.pathname + location.search + '#/' + id); } catch (e) { /* ignore */ } }
    S.sig[id] = null;
    renderNav();
    window.scrollTo(0, 0);
    if (id === 'agenda') S.agenda.scrolled = false;
    prepView(id);
    refresh(id, false);
  }

  function prepView(id) {
    const el = $('v-' + id);
    if (id === 'dashboard' && !S.resumo) el.innerHTML = skelDashboard();
    if (id === 'agenda') { if (!el.dataset.built) buildAgendaShell(); updateAgendaToolbar(); }
    if (id === 'conversas' && !el.dataset.built) { buildConversas(); $('cv-list').innerHTML = '<div style="padding:12px">' + '<div class="sk sk-row"></div>'.repeat(5) + '</div>'; }
    if (id === 'funil' && !S.leads) el.innerHTML = funilHead() + '<div class="kanban">' + ETAPAS.map(() => '<div class="col"><div class="sk sk-card"></div><div class="sk sk-card"></div></div>').join('') + '</div>';
  }

  /* ---------- polling ---------- */
  function refresh(view, quiet) {
    view = view || S.view;
    if (S.inflight[view]) return Promise.resolve();
    S.inflight[view] = true;
    const loaders = { dashboard: loadDashboard, agenda: loadAgenda, conversas: loadConversas, funil: loadFunil };
    return loaders[view](!!quiet).then(() => { S.erro[view] = null; setLive(true); }).catch((e) => {
      if (e && e.status === 401) return;
      setLive(false); $('error-msg').textContent = msgErro(e) + ' O painel tenta de novo sozinho.';
      if (!viewHasData(view)) { S.erro[view] = msgErro(e); renderErro(view); }
      else if (!quiet) toast(msgErro(e), 'err');
    }).then(() => { S.inflight[view] = false; });
  }
  const viewHasData = (v) => ({ dashboard: S.resumo, agenda: S.agenda.data, conversas: S.conversas, funil: S.leads }[v]);
  function poll() {
    if (!S.started || document.hidden) return;
    S.tick++;
    const v = S.view;
    if (v === 'conversas' || S.tick % 2 === 0) refresh(v, true);
    if (v !== 'dashboard' && S.tick % 6 === 0) api('GET', '/api/resumo').then((r) => { S.resumo = r; S.servicos = r.servicos || S.servicos; setHumano(r.kpis.humano_aberto); }).catch(() => {});
  }
  setInterval(poll, POLL_MS);

  /* =====================================================================
     ALERTA DE PEDIDO DE HUMANO (som ding-dong, banner, título piscando, notificação)
     ===================================================================== */
  const AL = { ids: null, pend: [], blink: null, ctx: null, orig: document.title, chamadas: 0, notifs: 0, plims: 0, maxIn: null, popup: 0 };
  window.__alerta = AL; /* gancho de teste: contadores de som e notificações */
  const somLigado = () => store('painel_som') !== '0';
  function audioCtx() {
    try { if (!AL.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) AL.ctx = new C(); } } catch (e) { /* sem áudio */ }
    return AL.ctx;
  }
  function destravaAudio() { const c = audioCtx(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, destravaAudio, { passive: true }));
  function nota(c, freq, t0, dur, pico) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(pico || 0.3, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(c.destination);
    [[1, 1], [2.01, 0.18], [3.02, 0.06]].forEach(([mult, vol]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = freq * mult; og.gain.value = vol;
      o.connect(og); og.connect(g); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }
  /* "senha de atendimento": ding (lá) e dong (mi), duas notas suaves com decaimento de sino */
  function dingDong() {
    AL.chamadas++;
    const c = audioCtx(); if (!c) return;
    destravaAudio();
    const t = c.currentTime + 0.03;
    nota(c, 880, t, 1.2);
    nota(c, 659.25, t + 0.52, 1.6);
  }
  /* "plim": uma nota curta e suave (~150 ms) para mensagem nova de paciente */
  function plim() {
    AL.plims++;
    const c = audioCtx(); if (!c) return;
    destravaAudio();
    nota(c, 1318.5, c.currentTime + 0.02, 0.16, 0.14);
  }
  function atualizaSom() {
    const on = somLigado();
    ['som', 'som-m'].forEach((id) => {
      const b = $(id); if (!b) return;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Desligar o som dos alertas' : 'Ligar o som dos alertas');
      b.title = on ? 'Som dos alertas ligado' : 'Som dos alertas desligado';
      b.classList.toggle('mute', !on);
      const u = b.querySelector('use'); if (u) u.setAttribute('href', on ? '#i-bell' : '#i-bell-off');
      const t = b.querySelector('.som-t'); if (t) t.textContent = on ? 'Som dos alertas: ligado' : 'Som dos alertas: desligado';
    });
  }
  function alternaSom() {
    const on = !somLigado();
    store('painel_som', on ? '1' : '0');
    atualizaSom();
    if (on) { dingDong(); toast('Som dos alertas ligado (pedidos de humano e novas mensagens).'); } else toast('Som dos alertas desligado.');
  }
  function renderBar() {
    let bar = $('al-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'al-bar'; bar.className = 'al-bar'; bar.setAttribute('role', 'alert'); document.body.appendChild(bar); }
    bar.hidden = !AL.pend.length;
    bar.innerHTML = AL.pend.slice(-3).map((p) => `<div class="al-item"><span class="al-ic">🔔</span><span class="al-t"><b>${esc(nomeOuFone(p.nome, p.telefone))}</b> pediu atendimento humano</span><button type="button" class="btn btn-sm al-open" data-al-open="${esc(p.telefone)}">Abrir conversa</button><button type="button" class="al-x" data-al-fechar="${p.id}" aria-label="Dispensar aviso">${icon('i-x')}</button></div>`).join('')
      + (AL.pend.length > 3 ? `<div class="al-more">+ ${AL.pend.length - 3} pedido(s) aguardando</div>` : '');
    atualizaTitulo();
  }
  function atualizaTitulo() {
    clearInterval(AL.blink); AL.blink = null;
    if (!AL.pend.length) { document.title = AL.orig; return; }
    const alerta = `(${AL.pend.length}) Pediu humano · MedicMais`;
    let on = true; document.title = alerta;
    AL.blink = setInterval(() => { on = !on; document.title = on ? alerta : AL.orig; }, 1000);
  }
  function limpaAlerta(filtro) {
    AL.pend = AL.pend.filter((p) => !filtro(p));
    renderBar();
  }
  function notificar(novos) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden && document.hasFocus()) return; /* já está olhando para o painel */
    novos.forEach((p) => {
      try {
        const n = new Notification('Pediu atendimento humano', { body: `${nomeOuFone(p.nome, p.telefone)} está aguardando a recepção.`, tag: 'humano-' + p.id });
        AL.notifs++;
        n.onclick = () => { window.focus(); abrirChat(p.telefone); n.close(); };
      } catch (e) { /* navegador sem suporte a construtor */ }
    });
  }
  function alertar(novos) {
    novos.forEach((p) => { if (!AL.pend.some((x) => x.id === p.id)) AL.pend.push(p); });
    renderBar();
    if (somLigado()) dingDong();
    notificar(novos);
    AL.alertouAgora = true;
    refresh(S.view, true);
  }
  async function pollHumano() {
    if (!S.started) return;
    try {
      const r = await api('GET', '/api/humano');
      const ids = new Set(r.humano.map((h) => h.id));
      setHumano(r.humano.length);
      if (AL.ids) {
        const novos = r.humano.filter((h) => !AL.ids.has(h.id));
        if (novos.length) alertar(novos);
      }
      AL.ids = ids; /* primeira carga só marca a linha de base, sem alerta */
      const idIn = r.ultima_in ? r.ultima_in.id : 0;
      if (AL.maxIn !== null && idIn > AL.maxIn && !AL.alertouAgora && somLigado()) plim(); /* mensagem nova de paciente */
      AL.alertouAgora = false;
      AL.maxIn = Math.max(AL.maxIn || 0, idIn);
      if (AL.pend.some((p) => !ids.has(p.id))) limpaAlerta((p) => !ids.has(p.id));
    } catch (e) { /* o ciclo principal já sinaliza falha de conexão */ }
  }
  setInterval(pollHumano, 5000);
  /* popup pedindo para ativar o som (o navegador só libera áudio depois de um clique) */
  function ofereceSom() {
    if (!somLigado()) return;
    const c = audioCtx(); if (!c) return;
    destravaAudio();
    setTimeout(() => {
      if (!S.started || c.state === 'running' || !$('modal').hidden) return; /* som já liberado nesta sessão */
      AL.popup++;
      openModal('Ative o som do painel', `<div class="som-pop"><span class="som-ic">${icon('i-bell')}</span><p>Ative o som para ouvir <b>novos pacientes</b> e <b>pedidos de atendimento</b> assim que chegarem.</p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close="1">Agora não</button><button type="button" class="btn btn-primary" data-som-sim="1" autofocus>Ativar som</button></div></div>`);
    }, 700);
  }
  document.addEventListener('click', (e) => {
    if (!(e.target.closest && e.target.closest('[data-som-sim]'))) return;
    store('painel_som', '1'); destravaAudio(); plim(); atualizaSom(); closeModal(); toast('Som ativado.');
  });
  function pedePermissaoNotificacao() {
    if (DEMO || !('Notification' in window) || Notification.permission !== 'default' || store('painel_notif_pedida') === '1') return;
    store('painel_notif_pedida', '1'); /* pede uma vez só, sem insistir */
    setTimeout(() => { try { Notification.requestPermission(); } catch (e) { /* ignore */ } }, 2500);
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest && e.target.closest('[data-al-open]'); if (o) { abrirChat(o.dataset.alOpen); return; }
    const x = e.target.closest && e.target.closest('[data-al-fechar]'); if (x) limpaAlerta((p) => String(p.id) === x.dataset.alFechar);
  });
  $('som').onclick = $('som-m').onclick = alternaSom;
  atualizaSom();

  /* =====================================================================
     LIGA/DESLIGA DO ROBÔ (pausado: a mensagem do paciente chega aqui, mas o robô não responde)
     ===================================================================== */
  const ROBO = { ativo: null, salvando: false };
  function atualizaRobo() {
    const on = ROBO.ativo !== false;
    const b = $('robo'), m = $('robo-m');
    [b, m].forEach((x) => { if (!x) return; x.hidden = ROBO.ativo === null; x.disabled = ROBO.salvando; x.setAttribute('aria-pressed', String(on)); x.classList.toggle('off', !on); });
    if (b) {
      b.querySelector('.robo-t').textContent = on ? 'Robô: ligado' : 'Robô: pausado';
      b.querySelector('.robo-a').textContent = on ? 'Pausar' : 'Reativar';
      b.title = on ? 'O robô está respondendo os pacientes no WhatsApp' : 'Robô pausado: a recepção responde pelo painel';
    }
    if (m) { m.setAttribute('aria-label', on ? 'Robô ligado. Pausar o robô' : 'Robô pausado. Reativar o robô'); m.title = on ? 'Robô ligado' : 'Robô pausado'; }
  }
  function lerRobo() {
    if (!S.started || ROBO.salvando) return;
    api('GET', '/api/robo').then((r) => { if (!ROBO.salvando) { ROBO.ativo = !!r.ativo; atualizaRobo(); } }).catch(() => {});
  }
  async function salvarRobo(ativo) {
    ROBO.salvando = true; atualizaRobo();
    try {
      const r = await api('POST', '/api/robo', { ativo });
      ROBO.ativo = !!r.ativo;
      toast(ROBO.ativo ? 'Robô reativado. Ele volta a responder os pacientes.' : 'Robô pausado. As mensagens continuam chegando aqui.');
    } catch (e) { toast('Não consegui mudar o robô: ' + msgErro(e), 'err'); }
    ROBO.salvando = false; atualizaRobo();
  }
  function alternaRobo() {
    if (ROBO.ativo === null || ROBO.salvando) return;
    if (!ROBO.ativo) { salvarRobo(true); return; }
    openModal('Pausar o robô?', `<p>Enquanto estiver pausado, o robô <b>não responde</b> os pacientes no WhatsApp. As mensagens continuam chegando em <b>Conversas</b> para a recepção responder.</p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close="1">Cancelar</button><button type="button" class="btn btn-danger" data-robo-pausar="1">Pausar robô</button></div>`);
  }
  document.addEventListener('click', (e) => {
    if (!(e.target.closest && e.target.closest('[data-robo-pausar]'))) return;
    closeModal(); salvarRobo(false);
  });
  $('robo').onclick = $('robo-m').onclick = alternaRobo;
  setInterval(lerRobo, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.started) refresh(S.view, true); });
  setInterval(() => { if (S.started && S.view === 'agenda') updateNowLine(); }, 30000);

  function renderErro(view) {
    const el = $('v-' + view);
    delete el.dataset.built;
    const box = `<div class="empty"><strong>Não consegui carregar</strong>${esc(S.erro[view])}<br><button class="btn btn-primary" type="button" data-retry="${view}">Tentar de novo</button></div>`;
    if (!viewHasData(view)) el.innerHTML = headHTML(view) + box;
  }
  function headHTML(view) {
    const t = { dashboard: 'Painel', agenda: 'Agenda', conversas: 'Conversas', funil: 'Funil de atendimento' }[view];
    return `<div class="vh"><div><h1 id="t-${view}">${t}</h1></div></div>`;
  }

  /* =====================================================================
     DASHBOARD
     ===================================================================== */
  function loadDashboard() {
    return api('GET', '/api/resumo').then((r) => {
      S.resumo = r; S.servicos = r.servicos || S.servicos; if (r.profissionais_hoje) S.profs = r.profissionais_hoje.map((p) => ({ id: p.id, titulo: p.titulo, nome: p.nome, especialidade: p.especialidade, cor: p.cor, servico: p.servico })); setHumano(r.kpis.humano_aberto);
      const sig = JSON.stringify([r.kpis, r.funil, r.proximos7, r.profissionais_hoje, r.por_profissional, r.feed, r.humano, r.proximas]) + Math.floor(Date.now() / 60000);
      if (sig !== S.sig.dashboard) { S.sig.dashboard = sig; renderDashboard(); }
    });
  }
  function skelDashboard() {
    return headHTML('dashboard') + `<div class="kpis">${'<div class="sk sk-kpi"></div>'.repeat(5)}</div><div class="dgrid"><div class="sk sk-box c6"></div>${'<div class="sk sk-box c3"></div>'.repeat(2)}${'<div class="sk sk-box c2"></div>'.repeat(3)}</div>`;
  }
  function renderDashboard() {
    const el = $('v-dashboard'), r = S.resumo;
    if (!r) { el.innerHTML = skelDashboard(); return; }
    const k = r.kpis, hoje = nowSP().d;
    const humano = r.humano || [];
    const maxF = Math.max(1, ...r.funil.map((f) => f.n)), totF = r.funil.reduce((a, f) => a + f.n, 0);
    const max7 = Math.max(1, ...r.proximos7.map((d) => d.n));
    const pp = r.por_profissional || [], maxP = Math.max(1, ...pp.map((p) => p.n)), totP = pp.reduce((a, p) => a + p.n, 0);
    const h = +r.agora.slice(0, 2);
    const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

    const kpi = (l, v, hint, cls, attr) => `<${attr ? 'button type="button"' : 'div'} class="kpi ${cls || ''}" ${attr || ''}><div class="kpi-l">${l}</div><div class="kpi-v">${v}</div><div class="kpi-h">${hint}</div></${attr ? 'button' : 'div'}>`;
    const kpis = [
      kpi('Conversas hoje', k.conversas_hoje, 'pacientes que escreveram hoje'),
      kpi('Agendados hoje', k.agendados_hoje, 'consultas marcadas para hoje', 'hl'),
      kpi('Consultas da semana', k.consultas_semana, 'de segunda a sábado'),
      kpi('Taxa de conversão', k.taxa_conversao + '%', `${k.leads_agendados} de ${k.total_leads} contatos viraram consulta`),
      kpi('Pedidos de humano', k.humano_aberto, k.humano_aberto ? 'aguardando a recepção' : 'nenhum pedido em aberto', k.humano_aberto ? 'warn' : '', k.humano_aberto ? 'data-filtro-humano="1"' : '')
    ].join('');

    const banner = humano.length ? `<div class="hum-banner"><strong>${humano.length === 1 ? 'Um paciente pediu' : humano.length + ' pacientes pediram'} atendimento humano:</strong>${humano.map((x) => `<button type="button" class="hum-chip" data-open-chat="${esc(x.telefone)}">${esc(nomeOuFone(x.nome, x.telefone))}<span style="color:var(--gray);font-weight:600">${esc(ago(x.atualizado_em))}</span></button>`).join('')}</div>` : '';

    const funil = r.funil.map((f) => {
      const e = ETAPAS.find((x) => x.id === f.etapa) || { nome: f.etapa, cor: '#999' };
      const pct = totF ? Math.round((f.n / totF) * 100) : 0;
      return `<div class="fun-row"><span class="fun-l">${esc(e.nome)}</span><div class="fun-t"><div class="fun-b" style="width:${(f.n / maxF) * 100}%;background:${e.cor}"></div></div><span class="fun-n">${f.n}<span class="fun-pct">${pct}%</span></span></div>`;
    }).join('');

    const dias = r.proximos7.map((d) => {
      const isT = d.dia === hoje, closed = dow(d.dia) === 0;
      const bh = d.n ? Math.max(6, Math.round((d.n / max7) * 128)) : 3;
      return `<div class="day-col${isT ? ' today' : ''}${closed ? ' closed' : ''}" title="${esc(fmtLong(d.dia))}: ${d.n} consulta(s)"><span class="day-n">${d.n}</span><div class="day-bar" style="height:${bh}px"></div><span class="day-w">${isT ? 'hoje' : WD3[dow(d.dia)]}</span></div>`;
    }).join('');

    const docs = (r.profissionais_hoje || []).map((p) => {
      const prox = !p.atende_hoje ? '<small>Sem expediente hoje</small>' : p.proxima ? `<small>Próxima consulta</small><span><b>${esc(p.proxima.hora)}</b> · ${esc(p.proxima.nome)}</span>` : p.consultas ? '<small>Dia concluído</small>' : '<small>Agenda livre hoje</small>';
      return `<button type="button" class="doc-row" style="--c:${esc(p.cor)}" data-doc-dia="${p.id}"><span class="pav lg">${esc(initials(p.nome))}</span><span class="doc-id"><b>${esc(profLabel(p))}</b><small>${esc(p.especialidade)}</small></span><span class="doc-n"><strong>${p.consultas}</strong><small>${p.consultas === 1 ? 'consulta' : 'consultas'} hoje</small></span><span class="doc-next">${prox}</span><span class="doc-occ"><span class="occ-t"><span class="occ-b" style="width:${p.ocupacao}%"></span></span><small>${p.atende_hoje ? `${p.ocupacao}% do expediente ocupado (${esc(p.inicio)} às ${esc(p.fim)})` : 'Fechado hoje'}</small></span></button>`;
    }).join('');

    const porMed = totP ? `<div class="pbars">${pp.slice().sort((a, b) => b.n - a.n).map((p) => `<div class="pbar" style="--c:${esc(p.cor)}"><span class="pav">${esc(initials(p.nome))}</span><div class="pbar-m"><div class="pbar-l"><b>${esc(profLabel(p))}</b><span>${p.n}</span></div><div class="pbar-t"><div class="pbar-b" style="width:${(p.n / maxP) * 100}%"></div></div></div></div>`).join('')}</div>` : '<div class="empty"><strong>Sem consultas na semana</strong>Quando houver consultas marcadas, a divisão por médico aparece aqui.</div>';

    const proximas = r.proximas.length ? `<div class="list">${r.proximas.map((a) => { const p = profDeAg(a); return `<div class="li"><span class="li-time">${esc(a.hora)}</span><div class="li-main"><div class="li-t">${esc(a.nome)}</div><div class="li-s">${p ? `<span class="mini-dot" style="background:${pCor(p)}"></span>${esc(profLabel(p))}` : esc(a.servico_nome)}</div></div><span class="chip st-${esc(a.status)}">${esc(STATUS_NOME[a.status] || a.status)}</span></div>`; }).join('')}</div><button class="btn btn-ghost btn-sm" style="margin-top:12px" type="button" data-agenda-hoje="1">Abrir a agenda de hoje</button>` : `<div class="empty"><strong>Nada marcado para hoje</strong>Toque em “Nova consulta” para marcar um paciente.</div>`;

    const feed = r.feed.length ? `<div class="list feed">${r.feed.slice(0, 10).map((m) => `<button type="button" class="li" data-open-chat="${esc(m.telefone)}"><span class="av ${m.direcao === 'out' ? (origemDe(m) === 'recepcao' ? 'rec' : 'out') : ''}">${esc(initials(nomeOuFone(m.nome, m.telefone)))}</span><div class="li-main"><div class="li-t">${esc(nomeOuFone(m.nome, m.telefone))}${m.medico ? `<span class="tag" style="margin-left:6px">${esc(m.medico)}</span>` : ''}</div><div class="li-s">${origemTag(origemDe(m))}${esc(previa(m.texto, m.midia_tipo))}</div></div><span class="li-r">${esc(ago(m.criado_em))}</span></button>`).join('')}</div>` : `<div class="empty"><strong>Nenhuma mensagem ainda</strong>As conversas do WhatsApp aparecem aqui assim que chegam.</div>`;

    el.innerHTML = `<div class="vh"><div><h1 id="t-dashboard">${saud}, recepção</h1><p>${esc(fmtLong(r.hoje))} · atualiza sozinho</p></div><div class="vh-actions"><button class="btn btn-primary" type="button" data-newappt="1">${icon('i-plus')}Nova consulta</button></div></div>
      ${banner}<div class="kpis">${kpis}</div>
      <div class="dgrid">
        <div class="card-box c6"><div class="cb-head"><h3>Agenda dos médicos hoje</h3><span class="cb-sub">${esc(fmtLong(r.hoje))}</span></div><div class="cb-body"><div class="docs">${docs || '<div class="empty"><strong>Sem médicos cadastrados</strong></div>'}</div></div></div>
        <div class="card-box c3"><div class="cb-head"><h3>Funil por etapa</h3><span class="cb-sub">${totF} contatos no total</span></div><div class="cb-body">${totF ? funil : '<div class="empty"><strong>Funil vazio</strong>Os contatos do WhatsApp entram aqui por etapa.</div>'}</div></div>
        <div class="card-box c3"><div class="cb-head"><h3>Consultas nos próximos 7 dias</h3><span class="cb-sub">sem canceladas</span></div><div class="cb-body"><div class="days">${dias}</div></div></div>
        <div class="card-box c2"><div class="cb-head"><h3>Por médico</h3><span class="cb-sub">esta semana</span></div><div class="cb-body">${porMed}</div></div>
        <div class="card-box c2"><div class="cb-head"><h3>Hoje na agenda</h3><span class="cb-sub">${r.proximas.length} consulta(s)</span></div><div class="cb-body">${proximas}</div></div>
        <div class="card-box c2"><div class="cb-head"><h3><span class="live-dot"></span>Ao vivo</h3><span class="cb-sub">últimas mensagens</span></div><div class="cb-body">${feed}</div></div>
      </div>`;
  }

  /* =====================================================================
     AGENDA (semana, dia por médico e mês)
     ===================================================================== */
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const firstOfMonth = (s) => s.slice(0, 8) + '01';
  const addMonths = (s, n) => { const d = toD(firstOfMonth(s)); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const profsVisiveis = () => { const ps = S.profs || []; return S.agenda.prof === 'todos' ? ps : ps.filter((p) => String(p.id) === String(S.agenda.prof)); };
  const profById = (id) => (S.profs || []).find((p) => String(p.id) === String(id));

  function agendaRange() {
    const A = S.agenda;
    if (A.mode === 'dia') return { dias: [A.ref] };
    if (A.mode === 'semana') { const m = monday(A.ref); return { dias: [0, 1, 2, 3, 4, 5].map((i) => addDays(m, i)) }; }
    const first = firstOfMonth(A.ref), nextFirst = addMonths(A.ref, 1);
    const last = addDays(nextFirst, -1), dias = [];
    for (let m = monday(first); m <= last; m = addDays(m, 7)) for (let i = 0; i < 6; i++) dias.push(addDays(m, i));
    return { dias, first, last };
  }
  function loadAgenda() {
    const { dias } = agendaRange();
    const ini = dias[0], fim = dias[dias.length - 1], mode = S.agenda.mode, ref = S.agenda.ref;
    return api('GET', `/api/agenda?inicio=${ini}&fim=${fim}`).then((r) => {
      if (mode !== S.agenda.mode || ref !== S.agenda.ref) return; /* usuário navegou enquanto carregava */
      S.agenda.data = r; S.servicos = r.servicos; S.profs = r.profissionais || S.profs;
      const sig = JSON.stringify(r.agendamentos) + ini + fim + S.agenda.mode + S.agenda.showCanc + S.agenda.prof + nowSP().h.slice(0, 4);
      if (sig !== S.sig.agenda) { S.sig.agenda = sig; renderAgenda(); }
    });
  }
  function buildAgendaShell() {
    const el = $('v-agenda');
    el.innerHTML = `<div class="vh"><div><h1 id="t-agenda">Agenda</h1><p id="ag-sub"></p></div>
      <div class="vh-actions">
        <div class="seg" role="group" aria-label="Visão da agenda"><button type="button" data-ag-mode="dia">Dia</button><button type="button" data-ag-mode="semana">Semana</button><button type="button" data-ag-mode="mes">Mês</button></div>
        <button class="btn btn-primary" type="button" data-newappt="1">${icon('i-plus')}Nova consulta</button>
      </div></div>
      <div class="ag-bar"><div class="vh-actions nav-d">
        <button class="icon-btn" type="button" data-ag-nav="-1" aria-label="Anterior">${icon('i-left')}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-ag-nav="0">Hoje</button>
        <button class="icon-btn" type="button" data-ag-nav="1" aria-label="Próximo">${icon('i-right')}</button>
        <span class="range" id="ag-range"></span></div>
        <label class="fchip canc"><input type="checkbox" id="ag-canc" style="accent-color:var(--red)"> Mostrar canceladas</label></div>
      <div class="pchips" id="ag-chips" role="group" aria-label="Filtrar por médico"></div>
      <div id="ag-wrap"><div class="sk sk-cal"></div></div>`;
    el.dataset.built = '1';
  }
  function updateAgendaToolbar() {
    const A = S.agenda, { dias } = agendaRange();
    document.querySelectorAll('[data-ag-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.agMode === A.mode)));
    $('ag-canc').checked = A.showCanc;
    const a = dias[0], b = dias[dias.length - 1];
    $('ag-range').textContent = A.mode === 'dia' ? fmtLong(A.ref) : A.mode === 'mes' ? `${MESES[+A.ref.slice(5, 7) - 1]} de ${A.ref.slice(0, 4)}` : (a.slice(5, 7) === b.slice(5, 7) ? `${+a.slice(8)} a ${fmtMonthDay(b)}` : `${fmtMonthDay(a)} a ${fmtMonthDay(b)}`);
    $('ag-sub').textContent = A.mode === 'dia' ? 'Uma coluna por médico. Clique num horário vago para marcar; clique numa consulta para ver detalhes.' : A.mode === 'semana' ? 'Visão da semana. Clique num horário vago para marcar ou numa consulta para ver detalhes.' : 'Visão do mês. Clique num dia para abrir a agenda dele.';
    const ps = S.profs || [];
    $('ag-chips').innerHTML = ps.length ? `<button type="button" class="pchip" data-prof="todos" aria-pressed="${A.prof === 'todos'}">Todos</button>` + ps.map((p) => `<button type="button" class="pchip" data-prof="${p.id}" aria-pressed="${String(A.prof) === String(p.id)}" style="--c:${esc(p.cor)}"><span class="pav">${esc(initials(p.nome))}</span><span class="pn"><b>${esc(p.titulo)} ${esc(p.nome.split(' ')[0])}</b><small>${esc(p.especialidade)}</small></span></button>`).join('') : '';
  }
  function lanes(evs) {
    const sorted = evs.slice().sort((x, y) => toMin(x.hora) - toMin(y.hora) || x.id - y.id);
    const out = []; let cluster = [], clusterEnd = -1;
    const flush = () => {
      if (!cluster.length) return;
      const ends = [];
      cluster.forEach((e) => {
        let l = ends.findIndex((end) => end <= toMin(e.hora));
        if (l === -1) { l = ends.length; ends.push(0); }
        ends[l] = toMin(e.hora) + (e.duracao_min || 30); e.__lane = l;
      });
      cluster.forEach((e) => { e.__lanes = ends.length; out.push(e); });
      cluster = [];
    };
    sorted.forEach((e) => {
      const s = toMin(e.hora);
      if (s >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(e); clusterEnd = Math.max(clusterEnd, s + (e.duracao_min || 30));
    });
    flush();
    return out;
  }
  /* trechos fechados (em minutos) de um dia; com médico, vale o expediente dele */
  function fechados(dia, prof) {
    const w = dow(dia), iso = w === 0 ? 7 : w;
    if (w === 0) return [[START, END]];
    const lim = (a, b) => [Math.max(START, a), Math.min(END, b)];
    if (!prof) return w === 6 ? [[720, END]] : [];
    const s = svBy(prof.servico);
    if (!s || !(s.dias_semana || []).includes(iso)) return [[START, END]];
    const z = [], ini = toMin(s.inicio), fim = Math.min(toMin(s.fim), iso === 6 ? 720 : 1440);
    if (ini > START) z.push(lim(START, ini));
    if (fim < END) z.push(lim(fim, END));
    return z;
  }
  const emFechado = (dia, m, prof) => fechados(dia, prof).some((z) => m >= z[0] && m < z[1]);
  const DIAS_ABREV = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sáb' };
  function expedienteTxt(p) {
    const s = svBy(p.servico); if (!s) return '';
    return `${(s.dias_semana || []).map((d) => DIAS_ABREV[d]).join(', ')}, ${s.inicio} às ${s.fim}`;
  }
  function evHTML(a, dia) {
    const s = toMin(a.hora), dur = a.duracao_min || 30;
    const top = (s - START) / 30 * HH + 1, h = Math.max(dur / 30 * HH - 2, 22);
    const w = 100 / a.__lanes, left = a.__lane * w;
    const tiny = h < 40, narrow = a.__lanes >= 3, p = profDeAg(a);
    const half = a.__lanes === 2;
    const stIc = !narrow && !half && (a.status === 'confirmado' || a.status === 'atendido') ? `<span class="e-st">${icon('i-check')}</span>` : '';
    const line3 = dia ? `${fmtPhone(a.telefone)} · ${STATUS_NOME[a.status]}` : (p ? profCurto(p) : '');
    const inner = tiny
      ? `<span class="e-t">${esc(a.hora)}</span><span class="e-n">${esc(a.nome)}</span>`
      : `<span class="e-t">${esc(a.hora)}${half ? '' : ' – ' + fmtMin(s + dur)}</span><span class="e-n">${esc(a.nome)}</span>${h >= 50 && line3 ? `<span class="e-s">${esc(line3)}</span>` : ''}`;
    return `<button type="button" class="ev st-${esc(a.status)}${tiny ? ' tiny' : ''}${narrow ? ' narrow' : ''}${dia ? ' dia' : ''}" data-ev="${a.id}" style="top:${top}px;height:${h}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);${agStyle(a)}" aria-label="${esc(a.nome)}, ${esc(a.servico_nome)}${p ? ' com ' + esc(profLabel(p)) : ''}, ${esc(fmtDM(a.data))} às ${esc(a.hora)}, ${esc(STATUS_NOME[a.status])}">${stIc}${inner}</button>`;
  }
  function visiveis() {
    const A = S.agenda;
    return A.data.agendamentos.filter((a) => (A.showCanc || a.status !== 'cancelado') && (A.prof === 'todos' || String((profDeAg(a) || {}).id) === String(A.prof)));
  }
  function renderAgenda() {
    const A = S.agenda, wrap = $('ag-wrap');
    if (!$('v-agenda').dataset.built) buildAgendaShell();
    updateAgendaToolbar();
    if (!A.data) return;
    if (A.mode === 'mes') { renderMes(); return; }
    const { dias } = agendaRange(), hoje = nowSP();
    const dayMode = A.mode === 'dia';
    const all = visiveis();
    const fora = all.filter((a) => toMin(a.hora) < START || toMin(a.hora) >= END);
    const dentro = all.filter((a) => !fora.includes(a));
    const prevScroll = wrap.querySelector('.cal-scroll');
    const sl = prevScroll ? prevScroll.scrollLeft : 0;
    const colunas = dayMode
      ? profsVisiveis().map((p) => ({ dia: A.ref, prof: p }))
      : dias.map((d) => ({ dia: d, prof: A.prof === 'todos' ? null : profById(A.prof) }));
    if (!colunas.length) { wrap.innerHTML = '<div class="empty"><strong>Sem médicos cadastrados</strong>Cadastre os profissionais para ver a agenda por médico.</div>'; return; }
    const doDia = (c) => dentro.filter((a) => a.data === c.dia && (!dayMode || String((profDeAg(a) || {}).id) === String(c.prof.id)));
    const cnt = (c) => A.data.agendamentos.filter((a) => a.data === c.dia && !['cancelado', 'faltou'].includes(a.status) && (!dayMode ? (A.prof === 'todos' || String((profDeAg(a) || {}).id) === String(A.prof)) : String((profDeAg(a) || {}).id) === String(c.prof.id))).length;
    const head = `<div class="cal-head"><div class="cal-h"></div>${colunas.map((c) => {
      const n = cnt(c), isT = c.dia === hoje.d;
      const sub = n ? n + (n === 1 ? ' consulta' : ' consultas') : (dow(c.dia) === 0 ? 'fechado' : 'livre');
      if (dayMode) return `<div class="cal-h prof${isT ? ' today' : ''}" style="--c:${esc(c.prof.cor)}"><span class="pav lg">${esc(initials(c.prof.nome))}</span><span class="pn"><b>${esc(profLabel(c.prof))}</b><small>${esc(c.prof.especialidade)}</small></span><span class="n">${sub}</span></div>`;
      return `<div class="cal-h${isT ? ' today' : ''}"><span class="w">${WD3[dow(c.dia)]}</span><span class="d">${+c.dia.slice(8)}</span><span class="n">${sub}</span></div>`;
    }).join('')}</div>`;
    const times = Array.from({ length: END / 60 - START / 60 }, (_, i) => `<span class="cal-time" style="top:${i * 2 * HH + (i === 0 ? 8 : 0)}px">${String(8 + i).padStart(2, '0')}:00</span>`).join('');
    const agoraNoGrid = hoje.min >= START && hoje.min <= END && colunas.some((c) => c.dia === hoje.d);
    const cols = colunas.map((c) => {
      const zones = fechados(c.dia, c.prof).map((z) => `<div class="cal-zone closed" style="top:${(z[0] - START) / 30 * HH}px;height:${(z[1] - z[0]) / 30 * HH}px"></div>`);
      if (c.dia < hoje.d) zones.push(`<div class="cal-zone past" style="top:0;height:${ROWS * HH}px"></div>`);
      else if (c.dia === hoje.d && hoje.min > START) zones.push(`<div class="cal-zone past" style="top:0;height:${Math.min(ROWS * HH, (hoje.min - START) / 30 * HH)}px"></div>`);
      const evs = lanes(doDia(c).map((a) => Object.assign({}, a))).map((a) => evHTML(a, dayMode)).join('');
      const now = c.dia === hoje.d && hoje.min >= START && hoje.min <= END ? `<div class="cal-now" data-now="1" style="top:${(hoje.min - START) / 30 * HH}px"></div>` : '';
      const closedAll = fechados(c.dia, c.prof).some((z) => z[0] <= START && z[1] >= END);
      return `<div class="cal-col${closedAll ? ' closed' : ''}" data-day="${c.dia}"${c.prof && dayMode ? ` data-prof="${c.prof.id}"` : ''}>${zones.join('')}${evs}${now}<div class="cal-ghost"></div></div>`;
    }).join('');
    const nCols = colunas.length;
    wrap.innerHTML = `<div class="cal"><div class="cal-scroll"><div class="cal-in" style="--cols:${nCols};--rows:${ROWS};--hh:${HH}px;--minw:${dayMode ? 54 + nCols * 172 : (nCols > 1 ? 700 : 0)}px">${head}<div class="cal-body"><div class="cal-times">${times}${agoraNoGrid ? `<span class="cal-nowlbl" data-nowlbl="1" style="top:${(hoje.min - START) / 30 * HH}px">${hoje.h}</span>` : ''}</div>${cols}</div></div></div>${fora.length ? `<div class="cal-empty">${fora.length} consulta(s) fora do horário da grade (08:00 às 18:00) não aparecem aqui.</div>` : ''}</div>`;
    const ns = wrap.querySelector('.cal-scroll'); if (ns) ns.scrollLeft = sl;
    if (!A.scrolled) {
      A.scrolled = true;
      const nl = wrap.querySelector('[data-now]');
      if (nl && !fora.length) {
        const y = nl.getBoundingClientRect().top + window.scrollY;
        if (y > window.innerHeight * 0.7) window.scrollTo({ top: y - window.innerHeight * 0.38 });
      }
    }
  }
  function renderMes() {
    const A = S.agenda, wrap = $('ag-wrap'), { dias } = agendaRange(), hoje = nowSP().d;
    const mesAtual = A.ref.slice(0, 7);
    const evs = visiveis().filter((a) => a.status !== 'cancelado' || A.showCanc);
    const heads = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => `<div class="mes-h">${d}</div>`).join('');
    const cells = dias.map((d) => {
      const doDia = evs.filter((a) => a.data === d).sort((a, b) => a.hora.localeCompare(b.hora));
      const ativos = doDia.filter((a) => !['cancelado', 'faltou'].includes(a.status));
      const dots = doDia.slice(0, 8).map((a) => `<i style="background:${pCor(profDeAg(a))}"${a.status === 'cancelado' ? ' class="x"' : ''}></i>`).join('');
      const passado = d < hoje, fora = d.slice(0, 7) !== mesAtual;
      const tip = ativos.length ? `${fmtLong(d)}: ${ativos.length} consulta(s)` : `${fmtLong(d)}: sem consultas`;
      return `<button type="button" class="mes-c${d === hoje ? ' today' : ''}${fora ? ' fora' : ''}${passado ? ' past' : ''}${ativos.length ? ' has' : ''}" data-mes-dia="${d}" title="${esc(tip)}" aria-label="${esc(tip)}"><span class="mes-n">${+d.slice(8)}</span>${ativos.length ? `<span class="mes-q">${ativos.length}<span> ${ativos.length === 1 ? 'consulta' : 'consultas'}</span></span>` : ''}<span class="mes-d">${dots}${doDia.length > 8 ? `<em>+${doDia.length - 8}</em>` : ''}</span></button>`;
    }).join('');
    wrap.innerHTML = `<div class="cal mes"><div class="mes-grid">${heads}${cells}</div></div>`;
  }
  function updateNowLine() {
    const n = document.querySelector('[data-now]'); if (!n) return;
    const h = nowSP();
    if (h.min < START || h.min > END) { n.remove(); const l0 = document.querySelector('[data-nowlbl]'); if (l0) l0.remove(); return; }
    n.style.top = (h.min - START) / 30 * HH + 'px';
    const l = document.querySelector('[data-nowlbl]'); if (l) { l.textContent = h.h; l.style.top = n.style.top; }
  }
  function agNav(dir) {
    const A = S.agenda;
    if (dir === 0) A.ref = nowSP().d;
    else if (A.mode === 'mes') A.ref = addMonths(A.ref, dir);
    else {
      A.ref = addDays(A.ref, dir * (A.mode === 'dia' ? 1 : 7));
      if (A.mode === 'dia' && dow(A.ref) === 0) A.ref = addDays(A.ref, dir); /* pula domingo no modo dia */
    }
    A.data = null; S.sig.agenda = null; $('ag-wrap').innerHTML = '<div class="sk sk-cal"></div>';
    updateAgendaToolbar(); refresh('agenda', false);
  }
  function setAgMode(m) {
    const A = S.agenda;
    if (A.mode === m) return;
    A.mode = m;
    if (m === 'dia' && dow(A.ref) === 0) A.ref = addDays(A.ref, 1);
    A.data = null; S.sig.agenda = null; A.scrolled = false; $('ag-wrap').innerHTML = '<div class="sk sk-cal"></div>';
    updateAgendaToolbar(); refresh('agenda', false);
  }
  /* hover: sugere o horário vago sob o mouse */
  document.addEventListener('mousemove', (e) => {
    const col = e.target.closest && e.target.closest('.cal-col');
    document.querySelectorAll('.cal-ghost.on').forEach((g) => { if (!col || g.parentNode !== col) g.classList.remove('on'); });
    if (!col || col.classList.contains('closed') || e.target.closest('.ev')) { if (col) col.querySelector('.cal-ghost').classList.remove('on'); return; }
    const m = slotFromY(col, e.clientY);
    const g = col.querySelector('.cal-ghost');
    if (!slotAberto(col.dataset.day, m, colProf(col))) { g.classList.remove('on'); return; }
    g.style.top = (m - START) / 30 * HH + 1 + 'px'; g.style.height = HH - 2 + 'px';
    g.textContent = '+ ' + fmtMin(m); g.classList.add('on');
  });
  const colProf = (col) => (col.dataset.prof ? profById(col.dataset.prof) : (S.agenda.mode === 'semana' && S.agenda.prof !== 'todos' ? profById(S.agenda.prof) : null));
  const slotFromY = (col, y) => START + Math.max(0, Math.min(ROWS - 1, Math.floor((y - col.getBoundingClientRect().top) / HH))) * 30;
  function slotAberto(dia, m, prof) {
    if (dia < nowSP().d) return false;
    return !emFechado(dia, m, prof);
  }

  /* =====================================================================
     SELETOR DE HORÁRIO (novo agendamento e remarcação)
     ===================================================================== */
  const svBy = (chave) => (S.servicos || []).find((s) => s.chave === chave);
  function slotFields(init) {
    const svs = S.servicos || [];
    return `<div class="field"><label for="sp-sv">Serviço</label><select class="inp" id="sp-sv" name="servico">${svs.map((s) => `<option value="${esc(s.chave)}"${s.chave === init.servico ? ' selected' : ''}>${esc(s.nome)} (${s.duracao_min} min)</option>`).join('')}</select></div>
      <div class="row2"><div class="field"><label for="sp-data">Data</label><input class="inp" type="date" id="sp-data" name="data" min="${nowSP().d}" value="${esc(init.data)}"></div>
      <div class="field"><label for="sp-hora">Hora</label><select class="inp" id="sp-hora" name="hora"></select></div></div>
      <p class="hint" id="sp-hint"></p>
      <div class="doc-line" id="sp-doc"></div>`;
  }
  function slotPicker(root, init, ignoreId) {
    const sv = root.querySelector('[name=servico]'), dt = root.querySelector('[name=data]'), hr = root.querySelector('[name=hora]'), hint = root.querySelector('#sp-hint');
    const cache = {};
    const dia = (d) => cache[d] || (cache[d] = api('GET', `/api/agenda?inicio=${d}&fim=${d}`).then((r) => r.agendamentos).catch(() => { delete cache[d]; return null; }));
    let seq = 0;
    async function refreshHoras(want) {
      const my = ++seq, s = svBy(sv.value), d = dt.value;
      const pr = s && profDeServico(s.chave), docEl = root.querySelector('#sp-doc');
      if (docEl) docEl.innerHTML = pr ? `<span class="pav" style="--c:${esc(pr.cor)}">${esc(initials(pr.nome))}</span><span><small>Atendimento com</small><b>${esc(profLabel(pr))}</b> · ${esc(pr.especialidade)}</span>` : '';
      hint.textContent = ''; hint.style.color = '';
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(d)) { hr.innerHTML = '<option value="">Escolha a data</option>'; return; }
      if (d < nowSP().d) { hr.innerHTML = '<option value="">Data já passou</option>'; hint.textContent = 'Essa data já passou. Escolha hoje ou uma data futura.'; hint.style.color = 'var(--red-dark)'; return; }
      const w = dow(d), iso = w === 0 ? 7 : w;
      if (!(s.dias_semana || [1, 2, 3, 4, 5, 6]).includes(iso)) { hr.innerHTML = '<option value="">Sem horários neste dia</option>'; hint.textContent = `${s.nome} não é atendido ${w === 0 ? 'aos domingos' : 'neste dia'}. Escolha outra data.`; hint.style.color = 'var(--red-dark)'; return; }
      hr.innerHTML = '<option value="">Carregando horários...</option>';
      const ags = await dia(d);
      if (my !== seq) return;
      let fim = toMin(s.fim || '18:00'); if (iso === 6) fim = Math.min(fim, 720);
      const ini = toMin(s.inicio || '08:00'), dur = s.duracao_min, step = Math.min(dur, 30), opts = [];
      const ativos = (ags || []).filter((a) => a.servico === s.chave && !['cancelado', 'faltou'].includes(a.status) && a.id !== ignoreId);
      for (let t = ini; t + dur <= fim; t += step) {
        const ocupados = ativos.filter((a) => toMin(a.hora) < t + dur && toMin(a.hora) + (a.duracao_min || dur) > t).length;
        const livre = ocupados < s.capacidade;
        opts.push(`<option value="${fmtMin(t)}"${livre ? '' : ' disabled'}>${fmtMin(t)}${livre ? '' : ' (lotado)'}</option>`);
      }
      hr.innerHTML = opts.join('') || '<option value="">Sem horários neste dia</option>';
      const alvo = want || hr.dataset.want;
      const o = alvo && [...hr.options].find((x) => x.value === alvo && !x.disabled);
      if (o) hr.value = alvo; else { const first = [...hr.options].find((x) => !x.disabled); if (first) hr.value = first.value; if (alvo && !o) { hint.textContent = `${alvo} não está livre para este serviço; sugerimos o próximo horário vago.`; } }
      if (ags === null) { hint.textContent = 'Não consegui conferir os horários ocupados; o servidor ainda valida conflitos ao salvar.'; }
    }
    sv.addEventListener('change', () => refreshHoras(hr.value));
    dt.addEventListener('change', () => refreshHoras(hr.value));
    hr.dataset.want = init.hora || '';
    refreshHoras(init.hora);
    return { get: () => ({ servico: sv.value, data: dt.value, hora: hr.value }), refresh: () => { Object.keys(cache).forEach((k) => delete cache[k]); return refreshHoras(hr.value); } };
  }

  /* ---------- textos do WhatsApp ---------- */
  function textoZap(tipo, a) {
    const nome = primeiroNome(a.nome), quando = `${WDLONG[dow(a.data)]}, ${fmtDM(a.data)}, às ${a.hora}`;
    const pr = profDeAg(a), base = `${a.servico_nome}${pr ? ' com ' + profLabel(pr) : ''}, ${quando}`;
    if (tipo === 'nova') return `Olá, ${nome}! Sua consulta na MedicMais Sobradinho está marcada: ${base}. Se precisar remarcar ou cancelar, é só responder por aqui. Esperamos você!`;
    if (tipo === 'confirmada') return `Olá, ${nome}! Sua consulta na MedicMais Sobradinho está confirmada: ${base}. Qualquer imprevisto, é só nos avisar por aqui. Até lá!`;
    if (tipo === 'remarcada') return `Olá, ${nome}! Sua consulta na MedicMais Sobradinho foi remarcada para ${base}. Se esse horário não ficar bom, é só nos responder por aqui que ajustamos.`;
    return `Olá, ${nome}! Sua consulta de ${a.servico_nome}${pr ? ' com ' + profLabel(pr) : ''} (${quando}) na MedicMais Sobradinho foi cancelada. Quando quiser remarcar, é só nos chamar por aqui.`;
  }
  async function avisar(tipo, ag) {
    try { await api('POST', '/api/enviar', { telefone: ag.telefone, texto: textoZap(tipo, ag) }); return true; }
    catch (e) { toast(`Consulta salva, mas não consegui avisar no WhatsApp: ${msgErro(e)}`, 'err'); return false; }
  }

  /* =====================================================================
     MODAL: NOVA CONSULTA
     ===================================================================== */
  async function ensureServicos() {
    if (S.servicos && S.profs) return;
    const t = nowSP().d;
    const r = await api('GET', `/api/agenda?inicio=${t}&fim=${t}`);
    S.servicos = r.servicos; S.profs = r.profissionais || S.profs;
  }
  async function novaConsulta(pre) {
    pre = pre || {};
    try { await ensureServicos(); } catch (e) { toast(msgErro(e), 'err'); return; }
    const hoje = nowSP();
    const Aa = S.agenda;
    let data = pre.data || (S.view === 'agenda' ? (Aa.mode === 'dia' ? Aa.ref : Aa.mode === 'mes' ? (hoje.d.slice(0, 7) === Aa.ref.slice(0, 7) ? hoje.d : firstOfMonth(Aa.ref)) : (agendaRange().dias.includes(hoje.d) ? hoje.d : agendaRange().dias[0])) : hoje.d);
    if (dow(data) === 0) data = addDays(data, 1);
    if (data < hoje.d) data = hoje.d;
    const hora = pre.hora || '';
    const svs = S.servicos;
    let servico = pre.servico || (S.view === 'agenda' && Aa.prof !== 'todos' && profById(Aa.prof) ? profById(Aa.prof).servico : store('painel_ult_sv'));
    const validoNaHora = (s) => { const w = dow(data) || 7; return (s.dias_semana || []).includes(w) && (!hora || (toMin(hora) >= toMin(s.inicio) && toMin(hora) + s.duracao_min <= Math.min(toMin(s.fim), w === 6 ? 720 : 1440))); };
    if (!svs.some((s) => s.chave === servico && validoNaHora(s))) servico = (svs.find(validoNaHora) || svs[0] || {}).chave;
    const F = { modo: pre.lead ? 'lead' : 'lead', lead: pre.lead || null, busca: '', leads: S.leads ? S.leads : null };

    openModal('Nova consulta', `<form id="nf" novalidate>
      <div class="field"><span class="lbl">Paciente</span>
        <div class="seg" role="group" aria-label="Tipo de paciente" style="margin-bottom:10px"><button type="button" data-nf-modo="lead" aria-pressed="true">Contato do WhatsApp</button><button type="button" data-nf-modo="novo" aria-pressed="false">Novo paciente</button></div>
        <div id="nf-lead"></div>
        <div id="nf-novo" hidden>
          <div class="field" style="margin-bottom:10px"><input class="inp" id="nf-nome" placeholder="Nome completo" autocomplete="off" maxlength="120" aria-label="Nome completo"></div>
          <input class="inp" id="nf-tel" inputmode="tel" placeholder="Telefone com DDD, ex.: (61) 99999-0000" autocomplete="off" aria-label="Telefone com DDD">
          <p class="hint">O contato novo entra no funil já como “Agendado”.</p>
        </div>
      </div>
      <div id="nf-slots">${slotFields({ servico, data, hora })}</div>
      <label class="check"><input type="checkbox" id="nf-avisar" checked><span>Avisar o paciente no WhatsApp<small>Envia a confirmação com serviço, dia e hora.</small></span></label>
      <div id="nf-err" class="err-inline" role="alert" hidden></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close="1">Cancelar</button><button type="submit" class="btn btn-primary" id="nf-ok">Agendar consulta</button></div>
    </form>`);
    const picker = slotPicker($('nf'), { servico, data, hora });

    const renderLead = () => {
      const box = $('nf-lead');
      if (F.lead) {
        box.innerHTML = `<div class="picked"><span class="av">${esc(initials(F.lead.nome))}</span><div><b>${esc(nomeOuFone(F.lead.nome, F.lead.telefone))}</b><small style="color:var(--gray)">${esc(fmtPhone(F.lead.telefone))}</small></div><button type="button" class="btn btn-ghost btn-sm" data-nf-trocar="1">Trocar</button></div>`;
        return;
      }
      if (!F.leads) { box.innerHTML = '<div class="sk" style="height:46px"></div>'; return; }
      const q = F.busca.trim().toLowerCase(), qd = q.replace(/\D/g, '');
      const lista = F.leads.filter((l) => !q || (l.nome || '').toLowerCase().includes(q) || (qd && l.telefone.includes(qd))).slice(0, 6);
      box.innerHTML = `<div class="search"><input class="inp" id="nf-busca" placeholder="Buscar por nome ou telefone" autocomplete="off" value="${esc(F.busca)}" aria-label="Buscar contato">${icon('i-search')}</div>
        <div class="pick-list">${lista.length ? lista.map((l) => `<button type="button" class="pick" data-nf-pick="${l.id}"><span class="av">${esc(initials(l.nome))}</span><span><b>${esc(nomeOuFone(l.nome, l.telefone))}</b><small>${esc(fmtPhone(l.telefone))} · ${esc(ETAPA_NOME[l.etapa] || l.etapa)}</small></span></button>`).join('') : `<div class="hint" style="padding:12px">Ninguém encontrado. Use “Novo paciente” para cadastrar.</div>`}</div>`;
    };
    renderLead();
    if (!F.leads) api('GET', '/api/leads').then((r) => { S.leads = r.leads; F.leads = r.leads; if (!F.lead) { renderLead(); } }).catch((e) => { $('nf-lead').innerHTML = `<div class="err-inline">Não consegui carregar os contatos: ${esc(msgErro(e))} Use “Novo paciente”.</div>`; });

    const m = $('modal-body');
    m.onclick = (e) => {
      const modo = e.target.closest('[data-nf-modo]');
      if (modo) {
        F.modo = modo.dataset.nfModo;
        m.querySelectorAll('[data-nf-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b === modo)));
        $('nf-lead').hidden = F.modo !== 'lead'; $('nf-novo').hidden = F.modo !== 'novo';
        return;
      }
      const pick = e.target.closest('[data-nf-pick]');
      if (pick) { F.lead = F.leads.find((l) => String(l.id) === pick.dataset.nfPick); renderLead(); return; }
      if (e.target.closest('[data-nf-trocar]')) { F.lead = null; renderLead(); const b = $('nf-busca'); if (b) b.focus(); }
    };
    m.oninput = (e) => {
      if (e.target.id === 'nf-busca') { F.busca = e.target.value; const pos = e.target.selectionStart; renderLead(); const b = $('nf-busca'); b.focus(); b.setSelectionRange(pos, pos); }
      if (e.target.id === 'nf-tel') e.target.value = maskPhone(e.target.value);
    };
    if (pre.lead) { /* já vem com paciente escolhido */ }

    $('nf').onsubmit = async (e) => {
      e.preventDefault();
      const err = $('nf-err'); err.hidden = true;
      const v = picker.get();
      const fail = (msg) => { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); };
      const body = { servico: v.servico, data: v.data, hora: v.hora };
      if (F.modo === 'lead') {
        if (!F.lead) return fail('Escolha o contato do WhatsApp ou cadastre um novo paciente.');
        body.lead_id = F.lead.id;
        if (!(F.lead.nome || '').trim()) body.nome = 'Paciente ' + fmtPhone(F.lead.telefone);
      } else {
        body.nome = $('nf-nome').value.trim(); body.telefone = $('nf-tel').value;
        if (body.nome.length < 2) return fail('Informe o nome do paciente.');
        if (body.telefone.replace(/\D/g, '').length < 10) return fail('Informe o telefone com DDD, por exemplo (61) 99999-0000.');
      }
      if (!v.hora) return fail('Escolha um horário livre.');
      const ok = $('nf-ok'); ok.disabled = true; ok.innerHTML = '<span class="spin"></span> Agendando...';
      try {
        const r = await api('POST', '/api/agendamentos', body);
        store('painel_ult_sv', v.servico);
        const quer = $('nf-avisar').checked, ag = r.agendamento;
        closeModal();
        toast(`Consulta de ${primeiroNome(ag.nome)} marcada para ${fmtDM(ag.data)} às ${ag.hora}.`);
        if (quer) { const sent = await avisar('nova', ag); if (sent) toast('Paciente avisado no WhatsApp.'); }
        S.leads = null; afterChange();
      } catch (er) {
        ok.disabled = false; ok.textContent = 'Agendar consulta';
        if (er.status === 401) return;
        fail(er.status === 409 || er.status === 422 ? er.message : msgErro(er));
        if (er.status === 409) picker.refresh();
      }
    };
  }

  function afterChange() {
    S.sig = {}; S.resumo = S.resumo; refresh(S.view, true);
    if (S.view !== 'dashboard') api('GET', '/api/resumo').then((r) => { S.resumo = r; setHumano(r.kpis.humano_aberto); }).catch(() => {});
  }

  /* =====================================================================
     MODAL: DETALHES DA CONSULTA
     ===================================================================== */
  function findAg(id) { return S.agenda.data && S.agenda.data.agendamentos.find((a) => String(a.id) === String(id)); }
  function detalhes(ag) {
    const st = ag.status, ativo = st === 'agendado' || st === 'confirmado';
    const fim = fmtMin(toMin(ag.hora) + (ag.duracao_min || 30));
    openModal('Consulta', `<div id="dt">
      <div class="det-top"><span class="av">${esc(initials(ag.nome))}</span><div><b>${esc(ag.nome)}</b><a href="https://wa.me/${esc(String(ag.telefone).replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(fmtPhone(ag.telefone))} · abrir no WhatsApp</a></div></div>
      <dl class="kv" style="${agStyle(ag)}"><dt>Médico</dt><dd>${profDeAg(ag) ? `<span class="pav sm" style="--c:${esc(pCor(profDeAg(ag)))}">${esc(initials(profDeAg(ag).nome))}</span>${esc(profLabel(profDeAg(ag)))}<small class="kv-s">${esc(profDeAg(ag).especialidade)}</small>` : '<span style="color:var(--gray)">Não definido</span>'}</dd><dt>Serviço</dt><dd><span class="sv-dot"></span>${esc(ag.servico_nome)}</dd><dt>Quando</dt><dd>${esc(WDLONG[dow(ag.data)])}, ${esc(fmtDM(ag.data))}</dd><dt>Horário</dt><dd>${esc(ag.hora)} às ${fim} (${ag.duracao_min || 30} min)</dd><dt>Situação</dt><dd><span class="chip st-${esc(st)}">${esc(STATUS_NOME[st])}</span></dd></dl>
      <div id="dt-main">
        <div class="btn-grid">
          ${st === 'agendado' ? `<button class="btn btn-ok full" type="button" data-dt="confirmar">${icon('i-check')}Confirmar consulta</button>` : ''}
          ${ativo ? `<button class="btn btn-ghost" type="button" data-dt="atendido">Marcar atendido</button><button class="btn btn-ghost" type="button" data-dt="faltou">Paciente faltou</button>` : `<button class="btn btn-ghost full" type="button" data-dt="reabrir">Reabrir como “Agendado”</button>`}
          <button class="btn btn-ghost" type="button" data-dt="remarcar">${icon('i-clock')}Remarcar</button>
          <button class="btn btn-ghost" type="button" data-dt="chat">${icon('i-chat')}Abrir conversa</button>
          ${st !== 'cancelado' ? `<button class="btn btn-danger full" type="button" data-dt="cancelar">Cancelar consulta</button>` : ''}
        </div>
        <label class="check" style="margin-top:14px"><input type="checkbox" id="dt-avisar" checked><span>Avisar o paciente no WhatsApp<small>Vale para confirmar, remarcar e cancelar.</small></span></label>
      </div>
      <div id="dt-sub"></div><div id="dt-err" class="err-inline" role="alert" hidden></div>
    </div>`);
    const err = (m) => { const e = $('dt-err'); e.textContent = m; e.hidden = !m; };
    let picker = null;

    const mudar = async (patch, tipoAviso, okMsg, btn, querOpt) => {
      err('');
      const quer = querOpt !== undefined ? querOpt : ($('dt-avisar') ? $('dt-avisar').checked : false);
      const old = btn && btn.innerHTML;
      document.querySelectorAll('#dt button').forEach((b) => { b.disabled = true; });
      if (btn) btn.innerHTML = '<span class="spin"></span> Salvando...';
      try {
        const r = await api('PATCH', `/api/agendamentos?id=${ag.id}`, patch);
        const novo = r.agendamento;
        closeModal(); toast(okMsg(novo));
        if (tipoAviso && quer) { const sent = await avisar(tipoAviso, novo); if (sent) toast('Paciente avisado no WhatsApp.'); }
        afterChange();
      } catch (e) {
        document.querySelectorAll('#dt button').forEach((b) => { b.disabled = false; });
        if (btn) btn.innerHTML = old;
        if (e.status !== 401) err(e.status === 409 || e.status === 422 ? e.message : msgErro(e));
        if (picker && e.status === 409) picker.refresh();
      }
    };

    $('modal-body').onclick = (e) => {
      const b = e.target.closest('[data-dt]'); if (!b) return;
      const a = b.dataset.dt;
      if (a === 'confirmar') mudar({ status: 'confirmado' }, 'confirmada', (n) => `Consulta de ${primeiroNome(n.nome)} confirmada.`, b);
      else if (a === 'atendido') mudar({ status: 'atendido' }, null, (n) => `${primeiroNome(n.nome)} marcado(a) como atendido(a).`, b);
      else if (a === 'faltou') mudar({ status: 'faltou' }, null, (n) => `${primeiroNome(n.nome)} marcado(a) como faltou. O horário foi liberado.`, b);
      else if (a === 'reabrir') mudar({ status: 'agendado' }, null, (n) => `Consulta de ${primeiroNome(n.nome)} reaberta.`, b);
      else if (a === 'chat') { closeModal(); abrirChat(ag.telefone); }
      else if (a === 'cancelar') {
        $('dt-main').hidden = true;
        $('dt-sub').innerHTML = `<div class="sec-t">Cancelar esta consulta?</div><p style="margin-bottom:10px">O horário de ${esc(ag.hora)} em ${esc(fmtDM(ag.data))} será liberado para outro paciente.</p><label class="check"><input type="checkbox" id="dt-avisar-c"><span>Avisar o paciente no WhatsApp<small>Envia uma mensagem de cancelamento cordial.</small></span></label><div class="modal-actions"><button class="btn btn-ghost" type="button" data-dt="voltar">Voltar</button><button class="btn btn-danger" type="button" data-dt="cancelar-sim">Sim, cancelar consulta</button></div>`;
      } else if (a === 'cancelar-sim') {
        const quer = $('dt-avisar-c').checked;
        mudar({ status: 'cancelado' }, 'cancelada', (n) => `Consulta de ${primeiroNome(n.nome)} cancelada.`, b, quer);
      } else if (a === 'remarcar') {
        $('dt-main').hidden = true;
        $('dt-sub').innerHTML = `<div class="sec-t">Remarcar consulta</div>${slotFields({ servico: ag.servico, data: ag.data, hora: ag.hora })}<label class="check"><input type="checkbox" id="dt-avisar-r" checked><span>Avisar o paciente no WhatsApp<small>Envia o novo dia e horário.</small></span></label><div class="modal-actions"><button class="btn btn-ghost" type="button" data-dt="voltar">Voltar</button><button class="btn btn-primary" type="button" data-dt="remarcar-ok">Salvar novo horário</button></div>`;
        picker = slotPicker($('dt-sub'), { servico: ag.servico, data: ag.data, hora: ag.hora }, ag.id);
      } else if (a === 'remarcar-ok') {
        const v = picker.get();
        if (!v.hora) { err('Escolha um horário livre.'); return; }
        if (v.servico === ag.servico && v.data === ag.data && v.hora === ag.hora) { err('Esse já é o horário atual. Escolha outro dia ou hora.'); return; }
        const quer = $('dt-avisar-r').checked;
        mudar(v, 'remarcada', (n) => `Consulta de ${primeiroNome(n.nome)} remarcada para ${fmtDM(n.data)} às ${n.hora}.`, b, quer);
      } else if (a === 'voltar') { err(''); picker = null; $('dt-sub').innerHTML = ''; $('dt-main').hidden = false; }
    };
  }

  /* =====================================================================
     CONVERSAS
     ===================================================================== */
  function loadConversas() {
    const reqs = [api('GET', '/api/conversas')];
    if (S.chat.tel) reqs.push(api('GET', '/api/conversas?telefone=' + encodeURIComponent(S.chat.tel)));
    return Promise.all(reqs).then(([lista, hist]) => {
      S.conversas = lista.conversas;
      setHumano(lista.conversas.filter((c) => c.precisa_humano).length);
      if (!$('v-conversas').dataset.built) buildConversas();
      if (!S.chat.tel && window.innerWidth >= 900 && lista.conversas.length) { S.chat.tel = lista.conversas[0].telefone; return loadConversas(); }
      renderConvList();
      if (hist && hist.telefone === S.chat.tel) { S.chat.lead = hist.lead; S.chat.mensagens = hist.mensagens; renderChat(); }
      updateChatOpen();
    });
  }
  function buildConversas() {
    $('v-conversas').dataset.built = '1';
    $('v-conversas').innerHTML = `<div class="vh"><div><h1 id="t-conversas">Conversas</h1><p>Mensagens do WhatsApp da clínica, atualizadas a cada 5 segundos.</p></div></div>
      <div class="chat" id="chat">
        <div class="chat-list">
          <div class="cl-top"><div class="search"><input class="inp" id="cv-busca" placeholder="Buscar paciente ou telefone" autocomplete="off" aria-label="Buscar conversa">${icon('i-search')}</div>
          <div class="filters"><button type="button" class="fchip" data-filtro="todas" aria-pressed="true">Todas</button><button type="button" class="fchip" data-filtro="humano" aria-pressed="false">Pediram humano<span class="n" id="cv-nh" hidden></span></button></div></div>
          <div class="cl-scroll" id="cv-list"></div>
        </div>
        <div class="chat-pane" id="chat-pane">
          <div class="pane-empty"><strong>Escolha uma conversa</strong>Selecione alguém na lista para ver o histórico e responder pelo WhatsApp da clínica.</div>
          <div class="cp-head" id="cp-head" hidden></div>
          <div class="msgs" id="msgs" hidden></div>
          <form class="composer" id="composer" hidden><textarea id="cv-text" rows="1" placeholder="Escreva a resposta para o paciente" aria-label="Mensagem" maxlength="2000"></textarea><button class="send" type="submit" id="cv-send" aria-label="Enviar mensagem">${icon('i-send')}</button></form>
        </div>
      </div>`;
    $('cv-busca').oninput = (e) => { S.busca = e.target.value; renderConvList(); };
    $('composer').onsubmit = (e) => { e.preventDefault(); enviarMsg(); };
    const ta = $('cv-text');
    ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviarMsg(); } };
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(130, ta.scrollHeight) + 'px'; };
  }
  function updateChatOpen() {
    const c = $('chat'); if (!c) return;
    c.classList.toggle('open', !!S.chat.tel);
    $('cp-head').hidden = $('msgs').hidden = $('composer').hidden = !S.chat.tel;
  }
  function renderConvList() {
    const box = $('cv-list'); if (!box || !S.conversas) return;
    document.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === S.filtro)));
    const nh = S.conversas.filter((c) => c.precisa_humano).length;
    const nb = $('cv-nh'); nb.hidden = !nh; nb.textContent = nh;
    const q = S.busca.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    let lista = S.conversas.filter((c) => (S.filtro !== 'humano' || c.precisa_humano) && (!q || (c.nome || '').toLowerCase().includes(q) || (qd && c.telefone.includes(qd))));
    if (!lista.length) {
      box.innerHTML = `<div class="empty" style="margin:12px;border-radius:12px"><strong>${S.conversas.length ? 'Nada por aqui' : 'Nenhuma conversa ainda'}</strong>${S.conversas.length ? 'Nenhuma conversa combina com o filtro. Limpe a busca ou volte para “Todas”.' : 'Quando um paciente escrever no WhatsApp da clínica, a conversa aparece aqui na hora.'}</div>`;
      return;
    }
    const scroll = box.scrollTop;
    box.innerHTML = lista.map((c) => {
      const hoje = nowSP().d, dia = c.ultima_em ? daySP(c.ultima_em) : '';
      const quando = !c.ultima_em ? '' : dia === hoje ? timeSP(c.ultima_em) : dia === addDays(hoje, -1) ? 'ontem' : fmtDM(dia);
      return `<button type="button" class="conv${c.telefone === S.chat.tel ? ' sel' : ''}${c.precisa_humano ? ' hum' : ''}" data-open-chat="${esc(c.telefone)}"><span class="av${c.precisa_humano ? ' hum' : ''}">${esc(initials(nomeOuFone(c.nome, c.telefone)))}</span><span class="conv-m"><span class="conv-n"><b>${esc(nomeOuFone(c.nome, c.telefone))}</b><time>${esc(quando)}</time></span><span class="conv-t">${c.ultima_direcao === 'out' ? (c.ultima_origem === 'recepcao' ? 'Recepção: ' : 'Maria: ') : ''}${esc(previa(c.ultima_texto, c.ultima_midia_tipo) || '(sem texto)')}</span><span class="conv-b">${c.precisa_humano ? '<span class="tag hum">Pediu humano</span>' : ''}${c.etapa ? `<span class="tag">${esc(ETAPA_NOME[c.etapa] || c.etapa)}</span>` : ''}</span></span></button>`;
    }).join('');
    box.scrollTop = scroll;
  }
  /* =====================================================================
     MÍDIA DO WHATSAPP (foto, áudio, vídeo guardados no PC da clínica, servidos via /api/midia)
     ===================================================================== */
  const MIDIA = { cache: new Map() };
  const TIPO_ROT = { audio: 'Áudio', imagem: 'Foto', video: 'Vídeo' };
  const MSG_MIDIA_OFF = 'Arquivo indisponível (o computador da clínica está offline)';
  function fetchMidia(arq) {
    if (MIDIA.cache.has(arq)) return MIDIA.cache.get(arq);
    const bruto = DEMO
      ? demo.midia(arq)
      : fetch('/api/midia?f=' + encodeURIComponent(arq), { headers: { 'x-painel-token': getToken() } }).then((r) => {
        if (r.status === 401) { sessaoExpirou(); throw new Error('401'); }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      });
    const p = bruto.then((b) => URL.createObjectURL(b));
    MIDIA.cache.set(arq, p);
    p.catch(() => { setTimeout(() => { if (MIDIA.cache.get(arq) === p) MIDIA.cache.delete(arq); }, 30000); }); /* tenta de novo depois de 30 s */
    return p;
  }
  const midiaPlaceholder = (m) => `<div class="mfile ${esc(m.midia_tipo || '')}" data-arq="${esc(m.midia_arquivo)}" data-tipo="${esc(m.midia_tipo || '')}"><span class="spin"></span> Carregando ${esc((TIPO_ROT[m.midia_tipo] || 'arquivo').toLowerCase())}...</div>`;
  function hidrataMidia(box) {
    box.querySelectorAll('.mfile:not([data-ok])').forEach((el) => {
      const arq = el.dataset.arq, tipo = el.dataset.tipo;
      const rolar = () => { if (box.dataset.stick === '1') box.scrollTop = box.scrollHeight; };
      fetchMidia(arq).then((url) => {
        if (!el.isConnected) return;
        el.dataset.ok = '1';
        if (tipo === 'audio') el.innerHTML = `<audio controls preload="metadata" src="${esc(url)}"></audio>`;
        else if (tipo === 'video') el.innerHTML = `<video controls preload="metadata" playsinline src="${esc(url)}"></video>`;
        else {
          el.innerHTML = `<button type="button" class="thumb" data-lightbox="${esc(url)}" data-nome="${esc(arq)}" aria-label="Ampliar foto"><img src="${esc(url)}" alt="Foto enviada pelo paciente"></button>`;
          el.querySelector('img').addEventListener('load', rolar);
        }
        rolar();
      }).catch(() => {
        if (!el.isConnected) return;
        el.dataset.ok = '0';
        el.innerHTML = `<span class="mfail">${icon('i-alert')}${MSG_MIDIA_OFF}</span>`;
      });
    });
  }
  function abreLightbox(url, nome) {
    let lb = $('lightbox');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'lightbox'; lb.className = 'lightbox';
      lb.innerHTML = `<div class="lb-bar"><a class="btn btn-primary btn-sm" id="lb-dl" download>Baixar</a><button type="button" class="btn btn-ghost btn-sm" data-lb-close="1">Fechar</button></div><img id="lb-img" alt="Foto ampliada">`;
      document.body.appendChild(lb);
    }
    $('lb-img').src = url; $('lb-dl').href = url; $('lb-dl').setAttribute('download', /\.[A-Za-z0-9]{2,4}$/.test(nome) ? nome : nome + '.jpg');
    lb.hidden = false; document.body.style.overflow = 'hidden';
  }
  function fechaLightbox() { const lb = $('lightbox'); if (lb && !lb.hidden) { lb.hidden = true; document.body.style.overflow = ''; } }
  document.addEventListener('click', (e) => {
    const th = e.target.closest && e.target.closest('[data-lightbox]');
    if (th) { abreLightbox(th.dataset.lightbox, th.dataset.nome || 'foto'); return; }
    if (e.target.closest && e.target.closest('[data-lb-close]')) { fechaLightbox(); return; }
    if (e.target.id === 'lightbox' || e.target.id === 'lb-img' && false) fechaLightbox();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechaLightbox(); });

  function renderChat() {
    const tel = S.chat.tel; if (!tel) return;
    const lead = S.chat.lead || (S.conversas || []).find((c) => c.telefone === tel) || {};
    const nome = nomeOuFone(lead.nome, tel);
    const head = `<button class="icon-btn back" type="button" data-chat-back="1" aria-label="Voltar para a lista">${icon('i-left')}</button><span class="av${lead.precisa_humano ? ' hum' : ''}">${esc(initials(nome))}</span><div class="cp-who"><b>${esc(nome)}</b><small>${esc(fmtPhone(tel))}${lead.etapa ? ' · ' + esc(ETAPA_NOME[lead.etapa] || lead.etapa) : ''}${lead.interesse ? ' · ' + esc(lead.interesse) : ''}</small></div><div class="cp-actions">${lead.precisa_humano ? `<span class="tag hum" title="${esc(lead.motivo_humano || '')}">Pediu humano</span><button class="btn btn-primary btn-sm" type="button" data-resolver="${lead.id || lead.lead_id}">${icon('i-check')}Resolvido</button>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-newappt="1" data-lead-tel="${esc(tel)}">${icon('i-cal')}Agendar</button></div>`;
    if (S.sig.head !== head) { S.sig.head = head; $('cp-head').innerHTML = head; }
    const msgs = S.chat.mensagens || [];
    const pend = S.chat.pend.filter((p) => !msgs.some((m) => m.direcao === 'out' && m.texto === p.texto && new Date(m.criado_em).getTime() >= p.t - 5000) && Date.now() - p.t < 25000 || p.falhou);
    S.chat.pend = pend;
    const sig = msgs.length + ':' + (msgs.length ? msgs[msgs.length - 1].id : 0) + ':' + pend.map((p) => p.id + (p.falhou ? 'f' : '')).join(',') + ':' + tel;
    if (sig === S.chat.sig) return;
    if (S.view === 'conversas' && [...$('msgs').querySelectorAll('audio,video')].some((x) => !x.paused)) return; /* não interrompe áudio/vídeo tocando */
    S.chat.sig = sig;
    const box = $('msgs'), nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90 || !box.dataset.tel || box.dataset.tel !== tel;
    box.dataset.tel = tel;
    let html = '', ultimo = '';
    const hoje = nowSP().d;
    const sep = (dia) => `<div class="sep">${dia === hoje ? 'Hoje' : dia === addDays(hoje, -1) ? 'Ontem' : fmtLong(dia)}</div>`;
    msgs.forEach((m) => {
      const dia = daySP(m.criado_em);
      if (dia !== ultimo) { html += sep(dia); ultimo = dia; }
      const o = origemDe(m);
      html += `<div class="bub ${m.direcao} o-${o}"><span class="blbl">${o === 'recepcao' ? icon('i-user') : ''}${ORIGEM[o]}</span>${m.midia_arquivo ? midiaPlaceholder(m) : ''}${corpoMsg(m.texto)}<time>${esc(timeSP(m.criado_em))}</time></div>`;
    });
    pend.forEach((p) => {
      if (hoje !== ultimo) { html += sep(hoje); ultimo = hoje; }
      html += `<div class="bub out o-recepcao ${p.falhou ? 'fail' : 'pend'}"><span class="blbl">${icon('i-user')}${ORIGEM.recepcao}</span>${esc(p.texto)}<time>${p.falhou ? 'não enviada' : 'enviando...'}</time></div>`;
    });
    if (!html) {
      const ult = (S.conversas || []).find((c) => c.telefone === tel);
      html = `<div class="msgs-empty"><strong>Sem histórico gravado</strong>${ult && ult.ultima_texto ? `Última mensagem do cadastro: “${esc(ult.ultima_texto)}”.<br>` : ''}As próximas mensagens desta conversa passam a aparecer aqui.</div>`;
    }
    box.dataset.stick = nearBottom ? '1' : '';
    box.innerHTML = html;
    hidrataMidia(box);
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }
  function abrirChat(tel) {
    limpaAlerta((p) => p.telefone === tel);
    S.chat = { tel, lead: null, mensagens: null, pend: [], sig: '' };
    S.sig.head = null;
    if (S.view !== 'conversas') { showView('conversas'); }
    else { S.inflight.conversas = false; refresh('conversas', false); }
    setTimeout(() => { const c = $('chat'); if (c) c.classList.add('open'); }, 0);
  }
  async function enviarMsg() {
    const ta = $('cv-text'), texto = ta.value.trim(), tel = S.chat.tel;
    if (!texto || !tel || $('cv-send').disabled) return;
    const p = { id: 'p' + Date.now(), texto, t: Date.now() };
    S.chat.pend.push(p); ta.value = ''; ta.style.height = 'auto'; S.chat.sig = ''; renderChat();
    const box = $('msgs'); box.scrollTop = box.scrollHeight;
    $('cv-send').disabled = true;
    try {
      await api('POST', '/api/enviar', { telefone: tel, texto });
      if (DEMO) S.chat.pend = [];
      setTimeout(() => refresh('conversas', true), 1200);
    } catch (e) {
      p.falhou = true; S.chat.sig = ''; renderChat();
      ta.value = texto;
      toast(e.status === 503 ? e.message : `Mensagem não enviada. ${msgErro(e)}`, 'err');
      setTimeout(() => { S.chat.pend = S.chat.pend.filter((x) => x !== p); S.chat.sig = ''; if (S.chat.tel === tel) renderChat(); }, 6000);
    }
    $('cv-send').disabled = false;
    ta.focus();
  }
  async function resolverHumano(leadId, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Salvando...'; }
    try {
      await api('PATCH', `/api/leads?id=${leadId}`, { precisa_humano: false });
      toast('Atendimento humano marcado como resolvido.');
      S.sig = {}; S.chat.sig = '';
      afterChange();
    } catch (e) { toast(msgErro(e), 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Resolvido'; } }
  }

  /* =====================================================================
     FUNIL
     ===================================================================== */
  /* =====================================================================
     FUNIL (kanban) + CONTEXTO DA IA (regras que a Maria lê a cada mensagem)
     ===================================================================== */
  const CAT_NOME = { triagem: 'Triagem', atendimento: 'Atendimento', regras: 'Regras', informacoes: 'Informações da clínica', geral: 'Geral' };
  const MSG_SALVO = 'Salvo — a Maria já usa na próxima mensagem';
  const DICAS = {
    novo_contato: 'Muita gente para aqui: revise a abordagem inicial e a triagem para a Maria qualificar mais rápido.',
    qualificado: 'O paciente foi entendido, mas não recebeu horário: reforce nas regras que a Maria deve oferecer datas logo após a triagem.',
    horario_oferecido: 'Receberam horário e não confirmaram: teste oferecer duas opções de horário e um lembrete cordial nas regras.',
    agendado: 'Agendados sem confirmação de presença: vale pedir a confirmação um dia antes.'
  };
  function loadFunil() {
    const reqs = [api('GET', '/api/leads')];
    if (S.funilTab === 'contexto') reqs.push(api('GET', '/api/contexto'));
    return Promise.all(reqs).then(([r, c]) => {
      S.leads = r.leads; if (c) S.ctx = c.regras;
      setHumano(r.leads.filter((l) => l.precisa_humano).length);
      const sig = JSON.stringify(r.leads) + (c ? JSON.stringify(c.regras) : '') + S.funilTab + Math.floor(Date.now() / 60000);
      if (sig === S.sig.funil) return;
      const a = document.activeElement;
      if (S.drag || S.ctxEdit || (a && a.matches && a.matches('#v-funil select, #v-funil textarea, #v-funil input'))) return; /* não atrapalha quem está mexendo */
      S.sig.funil = sig; renderFunil();
    });
  }
  function leadCard(l) {
    return `<article class="lcard${l.precisa_humano ? ' alert-h' : ''}" draggable="true" data-lead="${l.id}">${l.precisa_humano ? '<div class="badge-h">Pediu humano</div>' : ''}
      <div class="lc-name">${esc(l.nome || 'Sem nome')}</div>
      <div class="lc-top"><div class="lc-phone">${esc(fmtPhone(l.telefone))}</div><div class="lc-time">${esc(ago(l.atualizado_em))}</div></div>
      ${l.interesse ? `<span class="lc-int">${esc(l.interesse)}</span>` : ''}
      ${l.ultima_mensagem ? `<p class="lc-msg">“${esc(l.ultima_mensagem)}”</p>` : ''}
      <div class="lc-act"><select class="inp sel-sm" data-etapa-lead="${l.id}" aria-label="Mudar a etapa de ${esc(l.nome || 'contato')}">${ETAPAS.map((e) => `<option value="${e.id}"${e.id === l.etapa ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
      <button class="link" type="button" data-open-chat="${esc(l.telefone)}">${icon('i-chat')}Conversa</button>
      ${l.precisa_humano ? `<button class="btn btn-primary btn-sm" type="button" data-resolver="${l.id}">Resolvido</button>` : ''}</div></article>`;
  }
  function funilHead() {
    const t = S.funilTab;
    return `<div class="vh"><div><h1 id="t-funil">Funil de atendimento</h1><p>${t === 'funil' ? 'Em que ponto da conversa cada pessoa está. Arraste os cartões ou use o seletor para mudar a etapa.' : 'Ensine a Maria: o que ela deve saber e como deve atender.'}</p></div>
      <div class="vh-actions"><div class="seg" role="group" aria-label="Seção"><button type="button" data-funil-tab="funil" aria-pressed="${t === 'funil'}">Funil</button><button type="button" data-funil-tab="contexto" aria-pressed="${t === 'contexto'}">Contexto da IA</button></div></div></div>`;
  }
  function renderFunil() {
    const el = $('v-funil'), leads = S.leads || [];
    const head = funilHead();
    if (S.funilTab === 'contexto') { renderContexto(el, head); return; }
    if (!leads.length) { el.innerHTML = head + '<div class="empty"><strong>Nenhum contato no funil ainda</strong>Assim que alguém mandar mensagem para o WhatsApp da clínica, o atendente cria o cartão aqui e acompanha cada etapa.</div>'; return; }
    const sl = el.querySelector('.kanban') ? el.querySelector('.kanban').scrollLeft : 0;
    el.innerHTML = head + '<div class="kanban">' + ETAPAS.map((e) => {
      const col = leads.filter((l) => l.etapa === e.id).sort((a, b) => (b.precisa_humano ? 1 : 0) - (a.precisa_humano ? 1 : 0) || new Date(b.atualizado_em) - new Date(a.atualizado_em));
      return `<div class="col" data-col="${e.id}"><div class="col-head"><h3>${esc(e.nome)}</h3><span class="col-count">${col.length}</span></div><div class="cards">${col.length ? col.map(leadCard).join('') : '<div class="col-empty">Ninguém nesta etapa</div>'}</div></div>`;
    }).join('') + '</div>';
    el.querySelector('.kanban').scrollLeft = sl;
  }
  async function mudarEtapa(id, etapa) {
    const l = (S.leads || []).find((x) => String(x.id) === String(id));
    if (!l || l.etapa === etapa) { S.sig.funil = null; renderFunil(); return; }
    const antes = l.etapa; l.etapa = etapa; S.sig.funil = null; renderFunil();
    try {
      await api('PATCH', `/api/leads?id=${id}`, { etapa });
      toast(`${l.nome || 'Contato'} movido para “${ETAPA_NOME[etapa]}”.`);
    } catch (e) { l.etapa = antes; S.sig.funil = null; renderFunil(); toast(`Não consegui mudar a etapa. ${msgErro(e)}`, 'err'); }
  }

  /* ---------- mini-diagnóstico do funil ---------- */
  function diagnostico() {
    const L = S.leads || [], total = L.length;
    const idx = (l) => ETAPAS.findIndex((e) => e.id === l.etapa);
    const chegaram = ETAPAS.map((_, i) => L.filter((l) => idx(l) >= i).length);
    const parados = ETAPAS.map((e) => L.filter((l) => l.etapa === e.id).length);
    const conv = ETAPAS.map((_, i) => (i < ETAPAS.length - 1 && chegaram[i] ? Math.round(chegaram[i + 1] / chegaram[i] * 100) : null));
    let pior = -1;
    conv.forEach((c, i) => { if (c !== null && chegaram[i] >= 2 && (pior < 0 || c < conv[pior] || (c === conv[pior] && parados[i] > parados[pior]))) pior = i; });
    const humano = L.filter((l) => l.precisa_humano).length;
    const rows = ETAPAS.map((e, i) => `<div class="dg-row"><div class="dg-l"><b>${esc(e.nome)}</b><span>${chegaram[i]} chegaram${conv[i] !== null ? ` · <em class="${conv[i] < 50 ? 'low' : ''}">${conv[i]}% avançam</em>` : ''}</span></div><div class="dg-t"><div class="dg-b" style="width:${total ? chegaram[i] / total * 100 : 0}%;background:${e.cor}"></div></div></div>`).join('');
    const alerta = pior >= 0 && parados[pior] > 0
      ? `<div class="dg-call"><strong>${parados[pior]} ${parados[pior] === 1 ? 'lead parou' : 'leads pararam'} em ${esc(ETAPAS[pior].nome)}</strong>Só ${conv[pior]}% seguem para “${esc(ETAPAS[pior + 1].nome)}”. ${esc(DICAS[ETAPAS[pior].id] || '')}</div>`
      : `<div class="dg-call ok"><strong>${total ? 'Funil andando bem' : 'Sem dados ainda'}</strong>${total ? 'Nenhuma etapa concentra perda relevante no momento.' : 'Quando os contatos chegarem, o diagnóstico aparece aqui.'}</div>`;
    return `<aside class="ctx-side card-box"><div class="cb-head"><h3>Onde o funil perde gente</h3></div><div class="cb-body">${total ? rows : ''}${alerta}${humano ? `<p class="dg-hum">${humano} ${humano === 1 ? 'paciente pediu' : 'pacientes pediram'} atendimento humano agora.</p>` : ''}</div></aside>`;
  }

  /* ---------- contexto da IA ---------- */
  const catOpts = (sel) => Object.entries(CAT_NOME).filter(([k]) => k !== 'geral' || sel === 'geral').map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
  function ruleForm(r) {
    const novo = !r;
    return `<form class="rule edit" data-rule-form="${novo ? 'novo' : r.id}" novalidate>
      <div class="field"><label for="rf-t">Título da regra</label><input class="inp" id="rf-t" name="titulo" maxlength="120" value="${esc(r ? r.titulo : '')}" placeholder="Ex.: Triagem: qual médico para cada sintoma"></div>
      <div class="field"><label for="rf-c">Categoria</label><select class="inp" id="rf-c" name="categoria">${catOpts(r ? r.categoria : 'triagem')}</select></div>
      <div class="field"><label for="rf-x">O que a Maria deve saber ou fazer</label><textarea class="inp" id="rf-x" name="conteudo" rows="9" maxlength="8000" placeholder="Ex.: Dor na perna, costas ou cabeça → encaminhar para o clínico geral.">${esc(r ? r.conteudo : '')}</textarea><p class="hint">Escreva como se explicasse a uma recepcionista nova. Quanto mais claro, melhor a Maria atende.</p></div>
      <label class="check"><input type="checkbox" name="ativo"${!r || r.ativo ? ' checked' : ''}><span>Regra ativa<small>Desligada, a Maria ignora este texto.</small></span></label>
      <div class="err-inline" role="alert" hidden></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-rule-cancel="1">Cancelar</button><button class="btn btn-primary" type="submit">Salvar regra</button></div></form>`;
  }
  function ruleCard(r, i, n) {
    if (S.ctxEdit === r.id) return ruleForm(r);
    const del = S.ctxDel === r.id;
    return `<article class="rule${r.ativo ? '' : ' off'}" data-rule="${r.id}">
      <div class="rule-h"><span class="cat c-${esc(r.categoria)}">${esc(CAT_NOME[r.categoria] || r.categoria)}</span>
        <label class="tg" title="${r.ativo ? 'Regra ativa' : 'Regra desligada'}"><input type="checkbox" data-rule-toggle="${r.id}"${r.ativo ? ' checked' : ''} aria-label="Regra ativa: ${esc(r.titulo)}"><i></i></label></div>
      <h3>${esc(r.titulo)}</h3>
      <p class="rule-t" data-rule-expand="${r.id}">${esc(r.conteudo)}</p>
      ${del ? `<div class="rule-del"><span>Excluir esta regra? A Maria deixa de usá-la.</span><button type="button" class="btn btn-ghost btn-sm" data-rule-delno="1">Cancelar</button><button type="button" class="btn btn-danger btn-sm" data-rule-delsim="${r.id}">Excluir</button></div>`
      : `<div class="rule-f"><small>${r.ativo ? 'Ativa' : 'Desligada'} · atualizada ${esc(ago(r.atualizado_em))}</small><div class="rule-btns">
        <button type="button" class="icon-btn sm" data-rule-mover="up:${r.id}" aria-label="Subir regra"${i === 0 ? ' disabled' : ''}>${icon('i-up')}</button>
        <button type="button" class="icon-btn sm" data-rule-mover="down:${r.id}" aria-label="Descer regra"${i === n - 1 ? ' disabled' : ''}>${icon('i-down')}</button>
        <button type="button" class="icon-btn sm" data-rule-edit="${r.id}" aria-label="Editar regra">${icon('i-edit')}</button>
        <button type="button" class="icon-btn sm danger" data-rule-del="${r.id}" aria-label="Excluir regra">${icon('i-trash')}</button></div></div>`}
    </article>`;
  }
  function renderContexto(el, head) {
    const regras = S.ctx;
    const intro = `<div class="ctx-intro"><span class="ctx-ic">${icon('i-chat')}</span><p><b>A Maria lê estas regras a cada mensagem.</b> Ex.: dor na perna → clínico geral. Escreva, ligue ou desligue e reordene: o que você salvar vale já na próxima mensagem do paciente.</p></div>`;
    if (!regras) { el.innerHTML = head + intro + '<div class="sk sk-box"></div>'; return; }
    const ativas = regras.filter((r) => r.ativo).length;
    const lista = regras.map((r, i) => ruleCard(r, i, regras.length)).join('');
    el.innerHTML = head + intro + `<div class="ctx-grid"><div class="ctx-main">
      <div class="ctx-bar"><span>${regras.length} ${regras.length === 1 ? 'regra' : 'regras'} · ${ativas} ${ativas === 1 ? 'ativa' : 'ativas'}</span><button class="btn btn-primary btn-sm" type="button" data-rule-new="1">${icon('i-plus')}Nova regra</button></div>
      ${S.ctxEdit === 'novo' ? ruleForm(null) : ''}${lista || (S.ctxEdit === 'novo' ? '' : '<div class="empty"><strong>Nenhuma regra ainda</strong>Crie a primeira regra para ensinar a Maria, por exemplo qual médico atende cada sintoma.<br><button class="btn btn-primary btn-sm" type="button" data-rule-new="1">Nova regra</button></div>')}</div>${diagnostico()}</div>`;
    if (S.ctxEdit) { const f = el.querySelector('[data-rule-form] [name=titulo]'); if (f && !f.dataset.focado) { f.dataset.focado = '1'; f.focus(); } }
  }
  function carregaContexto() {
    return api('GET', '/api/contexto').then((c) => { S.ctx = c.regras; S.sig.funil = null; renderFunil(); }).catch((e) => toast(msgErro(e), 'err'));
  }
  async function salvaRegra(form) {
    const id = form.dataset.ruleForm, err = form.querySelector('.err-inline'), btn = form.querySelector('[type=submit]');
    const body = { titulo: form.titulo.value.trim(), categoria: form.categoria.value, conteudo: form.conteudo.value.trim(), ativo: form.ativo.checked };
    err.hidden = true;
    if (body.titulo.length < 2) { err.textContent = 'Dê um título curto para a regra.'; err.hidden = false; return; }
    if (!body.conteudo) { err.textContent = 'Escreva o texto da regra para a Maria.'; err.hidden = false; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Salvando...';
    try {
      if (id === 'novo') await api('POST', '/api/contexto', body); else await api('PATCH', `/api/contexto?id=${id}`, body);
      S.ctxEdit = null; toast(MSG_SALVO);
      await carregaContexto();
    } catch (e) { btn.disabled = false; btn.textContent = 'Salvar regra'; if (e.status !== 401) { err.textContent = msgErro(e); err.hidden = false; } }
  }
  (function ligaContexto() {
    const v = $('v-funil');
    v.addEventListener('click', async (e) => {
      const t = e.target;
      const tab = t.closest('[data-funil-tab]');
      if (tab) { if (S.funilTab !== tab.dataset.funilTab) { S.funilTab = tab.dataset.funilTab; S.ctxEdit = null; S.ctxDel = null; S.sig.funil = null; if (S.funilTab === 'contexto' && !S.ctx) { renderFunil(); } else renderFunil(); refresh('funil', false); } return; }
      if (t.closest('[data-rule-new]')) { S.ctxEdit = 'novo'; S.ctxDel = null; renderFunil(); return; }
      const ed = t.closest('[data-rule-edit]'); if (ed) { S.ctxEdit = +ed.dataset.ruleEdit; S.ctxDel = null; renderFunil(); return; }
      if (t.closest('[data-rule-cancel]')) { S.ctxEdit = null; S.sig.funil = null; renderFunil(); return; }
      const dl = t.closest('[data-rule-del]'); if (dl) { S.ctxDel = +dl.dataset.ruleDel; renderFunil(); return; }
      if (t.closest('[data-rule-delno]')) { S.ctxDel = null; renderFunil(); return; }
      const ds = t.closest('[data-rule-delsim]');
      if (ds) {
        ds.disabled = true;
        try { await api('DELETE', `/api/contexto?id=${ds.dataset.ruleDelsim}`); S.ctxDel = null; toast('Regra excluída. A Maria deixa de usá-la.'); await carregaContexto(); }
        catch (er) { ds.disabled = false; if (er.status !== 401) toast(msgErro(er), 'err'); }
        return;
      }
      const mv = t.closest('[data-rule-mover]');
      if (mv) {
        const [dir, id] = mv.dataset.ruleMover.split(':');
        try { const r = await api('PATCH', `/api/contexto?id=${id}`, { mover: dir }); S.ctx = r.regras; S.sig.funil = null; renderFunil(); }
        catch (er) { if (er.status !== 401) toast(msgErro(er), 'err'); }
        return;
      }
      const ex = t.closest('[data-rule-expand]'); if (ex) ex.classList.toggle('open');
    });
    v.addEventListener('change', async (e) => {
      const tg = e.target.closest && e.target.closest('[data-rule-toggle]');
      if (!tg) return;
      const id = tg.dataset.ruleToggle, ativo = tg.checked;
      try { const r = await api('PATCH', `/api/contexto?id=${id}`, { ativo }); const i = S.ctx.findIndex((x) => String(x.id) === String(id)); if (i >= 0) S.ctx[i] = r.regra; toast(MSG_SALVO); S.sig.funil = null; renderFunil(); }
      catch (er) { tg.checked = !ativo; if (er.status !== 401) toast(msgErro(er), 'err'); }
    });
    v.addEventListener('submit', (e) => { const f = e.target.closest && e.target.closest('[data-rule-form]'); if (f) { e.preventDefault(); salvaRegra(f); } });
  })();

  /* =====================================================================
     EVENTOS GLOBAIS
     ===================================================================== */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const nav = t.closest('[data-nav]'); if (nav) { showView(nav.dataset.nav); return; }
    if (t.closest('[data-close]')) { closeModal(); return; }
    const retry = t.closest('[data-retry]'); if (retry) { S.erro[retry.dataset.retry] = null; prepView(retry.dataset.retry); refresh(retry.dataset.retry, false); return; }
    const oc = t.closest('[data-open-chat]'); if (oc) { abrirChat(oc.dataset.openChat); return; }
    if (t.closest('[data-chat-back]')) { S.chat.tel = null; updateChatOpen(); renderConvList(); return; }
    const fh = t.closest('[data-filtro-humano]'); if (fh) { S.filtro = 'humano'; showView('conversas'); return; }
    const fl = t.closest('[data-filtro]'); if (fl) { S.filtro = fl.dataset.filtro; renderConvList(); return; }
    if (t.closest('[data-agenda-hoje]')) { S.agenda.mode = 'dia'; S.agenda.ref = nowSP().d; S.agenda.prof = 'todos'; S.agenda.data = null; showView('agenda'); return; }
    const dd = t.closest('[data-doc-dia]'); if (dd) { S.agenda.mode = 'dia'; S.agenda.ref = dow(nowSP().d) === 0 ? addDays(nowSP().d, 1) : nowSP().d; S.agenda.prof = dd.dataset.docDia; S.agenda.data = null; showView('agenda'); return; }
    const pc = t.closest('.pchip[data-prof]'); if (pc) { S.agenda.prof = pc.dataset.prof; S.sig.agenda = null; updateAgendaToolbar(); if (S.agenda.data) renderAgenda(); return; }
    const md = t.closest('[data-mes-dia]'); if (md) { S.agenda.mode = 'dia'; S.agenda.ref = dow(md.dataset.mesDia) === 0 ? addDays(md.dataset.mesDia, 1) : md.dataset.mesDia; S.agenda.data = null; S.sig.agenda = null; S.agenda.scrolled = false; $('ag-wrap').innerHTML = '<div class="sk sk-cal"></div>'; updateAgendaToolbar(); refresh('agenda', false); return; }
    const na = t.closest('[data-newappt]');
    if (na) {
      const tel = na.dataset.leadTel;
      if (tel) {
        const ensure = S.leads ? Promise.resolve(S.leads) : api('GET', '/api/leads').then((r) => { S.leads = r.leads; return r.leads; });
        ensure.then((ls) => { const lead = ls.find((l) => l.telefone === tel); novaConsulta(lead ? { lead } : {}); }).catch((er) => toast(msgErro(er), 'err'));
      } else novaConsulta();
      return;
    }
    const mode = t.closest('[data-ag-mode]'); if (mode) { setAgMode(mode.dataset.agMode); return; }
    const an = t.closest('[data-ag-nav]'); if (an) { agNav(+an.dataset.agNav); return; }
    const ev = t.closest('[data-ev]'); if (ev) { const ag = findAg(ev.dataset.ev); if (ag) detalhes(ag); return; }
    const col = t.closest('.cal-col');
    if (col) {
      const m = slotFromY(col, e.clientY), d = col.dataset.day, pr = colProf(col);
      if (dow(d) === 0) { toast('A clínica não abre aos domingos.', 'err'); return; }
      if (d < nowSP().d) { toast('Essa data já passou. Escolha hoje ou uma data futura.', 'err'); return; }
      if (emFechado(d, m, pr)) { toast(pr ? `${profLabel(pr)} não atende nesse horário (expediente: ${expedienteTxt(pr)}).` : 'Aos sábados a clínica fecha às 12:00.', 'err'); return; }
      novaConsulta({ data: d, hora: fmtMin(m), servico: pr ? pr.servico : undefined });
      return;
    }
    const rs = t.closest('[data-resolver]'); if (rs) { resolverHumano(rs.dataset.resolver, rs); return; }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'ag-canc') { S.agenda.showCanc = e.target.checked; S.sig.agenda = null; renderAgenda(); return; }
    const sel = e.target.closest && e.target.closest('[data-etapa-lead]');
    if (sel) mudarEtapa(sel.dataset.etapaLead, sel.value);
  });
  /* arrastar e soltar no funil (desktop) */
  document.addEventListener('dragstart', (e) => {
    const c = e.target.closest && e.target.closest('.lcard'); if (!c) return;
    S.drag = c.dataset.lead; c.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', S.drag); } catch (er) { /* ignore */ }
  });
  document.addEventListener('dragend', () => { S.drag = null; document.querySelectorAll('.drag,.over').forEach((x) => x.classList.remove('drag', 'over')); });
  document.addEventListener('dragover', (e) => { const col = e.target.closest && e.target.closest('.col'); if (col && S.drag) { e.preventDefault(); document.querySelectorAll('.col.over').forEach((x) => { if (x !== col) x.classList.remove('over'); }); col.classList.add('over'); } });
  document.addEventListener('drop', (e) => { const col = e.target.closest && e.target.closest('.col'); if (col && S.drag) { e.preventDefault(); const id = S.drag; S.drag = null; mudarEtapa(id, col.dataset.col); } });

  $('logout').onclick = $('logout-m').onclick = () => { clearToken(); if (DEMO) { location.search = ''; return; } showLogin(); };
  $('retry').onclick = () => refresh(S.view, false);

  /* ---------- entrada ---------- */
  $('login-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const tok = $('token').value.trim(), er = $('login-error'), btn = $('login-btn');
    if (!tok) { er.hidden = false; er.textContent = 'Digite o token de acesso para entrar.'; return; }
    setToken(tok, $('keep').checked); er.hidden = true;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Entrando...';
    api('GET', '/api/resumo').then((r) => { S.resumo = r; S.servicos = r.servicos; btn.disabled = false; btn.textContent = 'Entrar'; start(); })
      .catch((e) => {
        btn.disabled = false; btn.textContent = 'Entrar';
        if (e.status === 401) { clearToken(); er.hidden = false; er.textContent = 'Token incorreto. Confira se copiou inteiro, sem espaço no começo ou no fim.'; }
        else { clearToken(); er.hidden = false; er.textContent = e.net ? 'Sem conexão com o servidor. Confira sua internet e tente de novo.' : e.message; }
      });
  });

  function start() {
    $('login').hidden = true; $('app').hidden = false;
    S.started = true;
    AL.ids = null; AL.maxIn = null; pollHumano(); pedePermissaoNotificacao(); ofereceSom(); lerRobo();
    const h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    renderNav();
    setLive(true);
    showView(NAV.some((n) => n.id === h) ? h : 'dashboard', { noHash: false });
  }
  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    if (S.started && NAV.some((n) => n.id === h) && h !== S.view) showView(h, { noHash: true });
  });

  /* =====================================================================
     MODO DEMONSTRAÇÃO (?demo=1): API fictícia em memória, sem rede
     ===================================================================== */
  const demo = (function () {
    const SVS = [
      { chave: 'avaliacao_odonto', nome: 'Avaliação odontológica gratuita', duracao_min: 30, capacidade: 1, dias_semana: [1, 2, 3, 4, 5, 6], inicio: '08:00', fim: '18:00' },
      { chave: 'clinico_geral', nome: 'Consulta com clínico geral', duracao_min: 30, capacidade: 1, dias_semana: [1, 2, 3, 4, 5, 6], inicio: '08:00', fim: '18:00' },
      { chave: 'exames', nome: 'Coleta de exames de sangue', duracao_min: 15, capacidade: 3, dias_semana: [1, 2, 3, 4, 5, 6], inicio: '08:00', fim: '11:00' },
      { chave: 'pediatria', nome: 'Consulta pediátrica', duracao_min: 30, capacidade: 1, dias_semana: [1, 3, 5], inicio: '08:00', fim: '12:00' },
      { chave: 'ginecologia', nome: 'Consulta ginecológica', duracao_min: 30, capacidade: 1, dias_semana: [2, 4], inicio: '13:00', fim: '18:00' }
    ];
    const PROFS = [
      { id: 1, titulo: 'Dr.', nome: 'Paulo Mendes', especialidade: 'Clínico geral', servico: 'clinico_geral', cor: '#2563EB' },
      { id: 2, titulo: 'Dra.', nome: 'Camila Rocha', especialidade: 'Dentista · implantes', servico: 'avaliacao_odonto', cor: '#D9161D' },
      { id: 3, titulo: 'Enf.', nome: 'Juliana Alves', especialidade: 'Coleta de exames', servico: 'exames', cor: '#16A34A' },
      { id: 4, titulo: 'Dra.', nome: 'Beatriz Nunes', especialidade: 'Pediatra', servico: 'pediatria', cor: '#F59E0B' },
      { id: 5, titulo: 'Dra.', nome: 'Renata Castro', especialidade: 'Ginecologista', servico: 'ginecologia', cor: '#9333EA' }
    ];
    const profDe = (chave) => PROFS.find((p) => p.servico === chave) || null;
    let seq = 100, db = null;
    const iso = (min) => new Date(Date.now() - min * 60000).toISOString();
    function seed() {
      const hoje = nowSP().d, seg = monday(hoje);
      const L = [
        ['Helena Simulada', '5561900000011', 'novo_contato', 'Pediatria', 'Oi, vocês atendem criança de 4 anos?', false, 2],
        ['Igor Protótipo', '5561900000012', 'novo_contato', 'Ainda não informou', 'Bom dia, qual o valor da consulta?', true, 7],
        ['Júlia Ilustrativa', '5561900000013', 'qualificado', 'Avaliação odontológica', 'Quero colocar aparelho, aceitam convênio?', false, 18],
        ['Kleber Fictício', '5561900000014', 'qualificado', 'Clínico geral', 'Preciso de um clínico essa semana.', false, 55],
        ['Lívia Exemplo', '5561900000015', 'horario_oferecido', 'Avaliação odontológica', 'Vou ver com meu marido e já confirmo o horário.', false, 130],
        ['Marcos Teste', '5561900000016', 'horario_oferecido', 'Clínico geral', 'Tem horário à noite?', true, 26],
        ['Carla Fictícia', '5561900000003', 'agendado', 'Clínico geral', 'Perfeito, está ótimo!', false, 200],
        ['Diego Modelo', '5561900000004', 'agendado', 'Avaliação odontológica', 'Pode marcar sim, obrigado.', false, 90],
        ['Bruno Teste', '5561900000002', 'confirmado', 'Exames', 'Confirmado, estarei aí às 8h.', false, 1400],
        ['Elisa Demonstração', '5561900000005', 'confirmado', 'Avaliação odontológica', 'Confirmo sim, até amanhã!', false, 2500]
      ];
      const leads = L.map((l, i) => ({ id: i + 1, nome: l[0], telefone: l[1], etapa: l[2], interesse: l[3], ultima_mensagem: l[4], precisa_humano: l[5], motivo_humano: l[5] ? 'preco_ou_convenio' : null, criado_em: iso(l[6] + 300), atualizado_em: iso(l[6]) }));
      const A = (lead, sv, off, hora, st) => { const l = leads[lead]; return { id: ++seq, lead_id: l.id, nome: l.nome, telefone: l.telefone, servico: sv, data: addDays(seg, off), hora, status: st, criado_em: iso(500) }; };
      const ags = [
        A(8, 'exames', 0, '08:00', 'atendido'), A(9, 'avaliacao_odonto', 0, '09:30', 'atendido'), A(6, 'clinico_geral', 1, '14:30', 'atendido'),
        A(6, 'clinico_geral', 2, '10:00', 'confirmado'), A(7, 'avaliacao_odonto', 2, '15:00', 'agendado'), A(8, 'exames', 2, '08:00', 'confirmado'),
        A(2, 'exames', 2, '08:00', 'agendado'), A(3, 'exames', 2, '08:00', 'agendado'), A(9, 'avaliacao_odonto', 3, '09:00', 'confirmado'),
        A(7, 'clinico_geral', 3, '11:30', 'agendado'), A(6, 'avaliacao_odonto', 4, '16:00', 'agendado'), A(4, 'clinico_geral', 5, '09:00', 'agendado'),
        A(1, 'clinico_geral', 1, '09:00', 'cancelado'),
        A(0, 'pediatria', 0, '09:00', 'atendido'), A(0, 'pediatria', 2, '08:30', 'confirmado'), A(2, 'pediatria', 2, '10:00', 'agendado'), A(2, 'pediatria', 4, '09:30', 'agendado'),
        A(4, 'ginecologia', 1, '14:00', 'atendido'), A(4, 'ginecologia', 3, '15:30', 'agendado'), A(5, 'ginecologia', 3, '16:30', 'confirmado'), A(5, 'ginecologia', 1, '16:00', 'atendido'),
        A(3, 'clinico_geral', 0, '10:30', 'atendido'), A(3, 'clinico_geral', 0, '15:00', 'agendado'), A(9, 'avaliacao_odonto', 5, '10:30', 'agendado'), A(8, 'avaliacao_odonto', 1, '11:00', 'agendado')
      ];
      const T = (tel, arr) => arr.map((m, i) => ({ id: ++seq, telefone: tel, midia_tipo: m[4] || null, midia_arquivo: m[5] || null, direcao: m[0], origem: m[3] || (m[0] === 'in' ? 'paciente' : 'ia'), texto: m[1], criado_em: iso(m[2]) }));
      const msgs = [].concat(
        T('5561900000012', [['in', 'Bom dia, qual o valor da consulta?', 9], ['out', 'Bom dia! Aqui é o atendimento da MedicMais Sobradinho. Para te passar o valor certo, me diz: é consulta com clínico geral ou avaliação odontológica?', 8], ['in', 'Clínico geral. E aceitam plano de saúde?', 7], ['in', '[Áudio do paciente, transcrito]: Oi, é que eu queria saber se vocês atendem aos sábados também, porque durante a semana eu trabalho.', 5, null, 'audio', 'demo-audio.wav'], ['out', 'Oi, Igor! Aqui é da recepção da MedicMais. Vou te passar o valor e os horários de sábado agora mesmo.', 3, 'recepcao']]),
        T('5561900000011', [['in', 'Oi, vocês atendem criança de 4 anos?', 3], ['out', 'Oi! Atendemos sim. Qual atendimento você procura para ela?', 2], ['in', '[Foto enviada pelo paciente. O que aparece nela]: Carteirinha de vacinação infantil aberta, com várias doses registradas.', 1, null, 'imagem', 'demo-foto.svg']]),
        T('5561900000013', [['in', 'Quero colocar aparelho', 40], ['out', 'Claro! Na MedicMais fazemos uma avaliação odontológica gratuita. Quer que eu veja um horário pra você?', 39], ['in', 'Quero colocar aparelho, aceitam convênio?', 18]]),
        T('5561900000016', [['in', 'Boa tarde, tem horário à noite?', 30], ['out', 'Boa tarde! Nosso atendimento é das 8h às 18h, e aos sábados até as 12h.', 29], ['in', 'Tem horário à noite?', 26]]),
        T('5561900000003', [['in', 'Quero marcar um clínico geral', 260], ['out', 'Tenho quinta às 14h30. Pode ser?', 255], ['in', 'Perfeito, está ótimo!', 200]])
      );
      return { leads, ags, msgs };
    }
    const snap = (a) => { const s = SVS.find((x) => x.chave === a.servico), p = profDe(a.servico); return Object.assign({}, a, { servico_nome: s ? s.nome : a.servico, duracao_min: s ? s.duracao_min : 30, profissional: p ? { id: p.id, titulo: p.titulo, nome: p.nome, especialidade: p.especialidade, cor: p.cor } : null }); };
    const ativo = (a) => !['cancelado', 'faltou'].includes(a.status);
    function validar(sv, data, hora, ignorar, tel) {
      const s = SVS.find((x) => x.chave === sv);
      if (!s) throw new ApiError(400, 'Serviço desconhecido.');
      const w = dow(data), iso7 = w === 0 ? 7 : w;
      if (!s.dias_semana.includes(iso7)) throw new ApiError(422, `${s.nome} não é atendido aos domingos.`);
      const fim = Math.min(toMin(s.fim), iso7 === 6 ? 720 : 1440);
      if (toMin(hora) < toMin(s.inicio) || toMin(hora) + s.duracao_min > fim) throw new ApiError(422, `Fora do horário de atendimento de ${s.nome}: ${s.inicio} às ${fmtMin(fim)}.`);
      if (data < nowSP().d) throw new ApiError(422, 'Essa data já passou. Escolha hoje ou uma data futura.');
      const sob = db.ags.filter((a) => a.id !== ignorar && ativo(a) && a.servico === sv && a.data === data && toMin(a.hora) < toMin(hora) + s.duracao_min && toMin(a.hora) + s.duracao_min > toMin(hora));
      if (tel && sob.some((a) => a.telefone === tel)) throw new ApiError(409, 'Esse paciente já tem esse serviço marcado nesse mesmo horário.');
      if (sob.length >= s.capacidade) throw new ApiError(409, s.capacidade > 1 ? `Horário lotado: ${s.nome} comporta ${s.capacidade} pacientes ao mesmo tempo.` : `Horário já ocupado para ${s.nome}. Escolha outro horário.`);
      return s;
    }
    function resumo() {
      const hoje = nowSP().d, seg = monday(hoje);
      const ativos = db.ags.filter(ativo);
      const porSv = SVS.map((s) => ({ nome: s.nome, chave: s.chave, n: ativos.filter((a) => a.servico === s.chave).length })).filter((x) => x.n);
      const feed = db.msgs.slice().sort((a, b) => b.id - a.id).slice(0, 12).map((m) => { const ag = ativos.filter((a) => a.telefone === m.telefone && a.data >= hoje).sort((x, y) => (x.data + x.hora).localeCompare(y.data + y.hora))[0], p = ag && profDe(ag.servico); return Object.assign({}, m, { nome: (db.leads.find((l) => l.telefone === m.telefone) || {}).nome, medico: p ? p.titulo + ' ' + p.nome : null }); });
      const leadsAg = new Set(db.ags.filter((a) => a.status !== 'cancelado').map((a) => a.lead_id));
      return {
        hoje, agora: nowSP().h,
        kpis: {
          conversas_hoje: new Set(db.msgs.filter((m) => daySP(m.criado_em) === hoje).map((m) => m.telefone)).size,
          agendados_hoje: ativos.filter((a) => a.data === hoje).length,
          consultas_semana: ativos.filter((a) => a.data >= seg && a.data <= addDays(seg, 5)).length,
          taxa_conversao: Math.round((leadsAg.size / db.leads.length) * 100), total_leads: db.leads.length, leads_agendados: leadsAg.size,
          humano_aberto: db.leads.filter((l) => l.precisa_humano).length, leads_novos_hoje: 2
        },
        funil: ETAPAS.map((e) => ({ etapa: e.id, n: db.leads.filter((l) => l.etapa === e.id).length })),
        proximos7: Array.from({ length: 7 }, (_, i) => { const d = addDays(hoje, i); return { dia: d, n: ativos.filter((a) => a.data === d).length }; }),
        por_servico: porSv, feed,
        profissionais_hoje: PROFS.map((p) => { const sv = SVS.find((x) => x.chave === p.servico), w = dow(hoje), iso7 = w === 0 ? 7 : w, meus = ativos.filter((a) => a.data === hoje && a.servico === p.servico).sort((a, b) => a.hora.localeCompare(b.hora)); const fim = Math.min(toMin(sv.fim), iso7 === 6 ? 720 : 1440), exp = sv.dias_semana.includes(iso7) ? fim - toMin(sv.inicio) : 0, ocup = meus.reduce((t, a) => t + sv.duracao_min, 0), ag = nowSP().min, prox = meus.find((a) => toMin(a.hora) + sv.duracao_min > ag && a.status !== 'atendido'); return Object.assign({}, p, { consultas: meus.length, atendidas: meus.filter((a) => a.status === 'atendido').length, expediente_min: exp, ocupado_min: ocup, ocupacao: exp ? Math.min(100, Math.round(ocup / sv.capacidade / exp * 100)) : 0, inicio: sv.inicio, fim: sv.fim, atende_hoje: exp > 0, proxima: prox ? { hora: prox.hora, nome: prox.nome } : null }); }),
        por_profissional: PROFS.map((p) => Object.assign({}, p, { n: ativos.filter((a) => a.servico === p.servico && a.data >= seg && a.data <= addDays(seg, 5)).length })),
        humano: db.leads.filter((l) => l.precisa_humano).map((l) => ({ id: l.id, nome: l.nome, telefone: l.telefone, motivo_humano: l.motivo_humano, etapa: l.etapa, atualizado_em: l.atualizado_em })),
        proximas: ativos.filter((a) => a.data === hoje).sort((a, b) => a.hora.localeCompare(b.hora)).map(snap),
        servicos: SVS.map((s) => ({ chave: s.chave, nome: s.nome, duracao_min: s.duracao_min, capacidade: s.capacidade }))
      };
    }
    function route(method, path, body) {
      const u = new URL(path, 'http://x'), p = u.pathname, q = u.searchParams;
      if (p === '/api/resumo') { const r = resumo(); r.servicos = SVS.map((s) => Object.assign({}, s)); return r; }
      if (p === '/api/contexto') return rotaContexto(method, q, body);
      if (p === '/api/humano') return { ultima_in: (() => { const m = db.msgs.filter((x) => x.direcao === 'in').sort((a, b) => b.id - a.id)[0]; return m ? { id: m.id, telefone: m.telefone } : null; })(), humano: db.leads.filter((l) => l.precisa_humano).map((l) => ({ id: l.id, telefone: l.telefone, nome: l.nome, motivo_humano: l.motivo_humano, etapa: l.etapa, atualizado_em: l.atualizado_em })) };
      if (p === '/api/profissionais') return { profissionais: PROFS };
      if (p === '/api/robo') { if (method === 'POST') db.robo = !!body.ativo; return { ativo: db.robo !== false }; }
      if (p === '/api/agenda') { const i = q.get('inicio'), f = q.get('fim'); return { inicio: i, fim: f, profissionais: PROFS, agendamentos: db.ags.filter((a) => a.data >= i && a.data <= f).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).map(snap), servicos: SVS.map((s) => Object.assign({}, s)) }; }
      if (p === '/api/leads' && method === 'GET') return { leads: db.leads.slice().sort((a, b) => (b.precisa_humano - a.precisa_humano) || (new Date(b.atualizado_em) - new Date(a.atualizado_em))) };
      if (p === '/api/leads') { const l = db.leads.find((x) => String(x.id) === q.get('id')); if (!l) throw new ApiError(404, 'Contato não encontrado.'); if (body.etapa) l.etapa = body.etapa; if (typeof body.precisa_humano === 'boolean') l.precisa_humano = body.precisa_humano; l.atualizado_em = iso(0); return { lead: l }; }
      if (p === '/api/conversas') {
        const tel = q.get('telefone');
        if (tel) return { telefone: tel, lead: db.leads.find((l) => l.telefone === tel) || null, mensagens: db.msgs.filter((m) => m.telefone === tel).sort((a, b) => a.id - b.id) };
        const tels = [...new Set(db.msgs.map((m) => m.telefone))];
        const conversas = tels.map((t) => { const ms = db.msgs.filter((m) => m.telefone === t).sort((a, b) => b.id - a.id), l = db.leads.find((x) => x.telefone === t) || {}; return { telefone: t, ultima_texto: ms[0].texto, ultima_direcao: ms[0].direcao, ultima_origem: ms[0].origem, ultima_em: ms[0].criado_em, total: ms.length, sem_historico: false, lead_id: l.id, nome: l.nome, etapa: l.etapa, interesse: l.interesse, precisa_humano: !!l.precisa_humano, motivo_humano: l.motivo_humano }; });
        return { conversas: conversas.sort((a, b) => (b.precisa_humano - a.precisa_humano) || (new Date(b.ultima_em) - new Date(a.ultima_em))) };
      }
      if (p === '/api/enviar') {
        db.msgs.push({ id: ++seq, telefone: body.telefone, direcao: 'out', origem: 'recepcao', texto: body.texto, criado_em: iso(0) });
        return { ok: true };
      }
      if (p === '/api/agendamentos' && method === 'POST') {
        let lead = body.lead_id ? db.leads.find((l) => l.id === body.lead_id) : null;
        const nome = lead ? lead.nome : body.nome, tel = lead ? lead.telefone : ('55' + String(body.telefone).replace(/\D/g, ''));
        const s = validar(body.servico, body.data, body.hora, null, tel);
        if (!lead) { lead = db.leads.find((l) => l.telefone === tel); if (!lead) { lead = { id: db.leads.length + 1, nome, telefone: tel, etapa: 'agendado', interesse: s.nome, ultima_mensagem: null, precisa_humano: false, motivo_humano: null, criado_em: iso(0), atualizado_em: iso(0) }; db.leads.push(lead); } }
        if (['novo_contato', 'qualificado', 'horario_oferecido'].includes(lead.etapa)) lead.etapa = 'agendado';
        const a = { id: ++seq, lead_id: lead.id, nome, telefone: tel, servico: body.servico, data: body.data, hora: body.hora, status: body.status || 'agendado', criado_em: iso(0) };
        db.ags.push(a); return snap(a) && { agendamento: snap(a) };
      }
      if (p === '/api/agendamentos' && method === 'PATCH') {
        const a = db.ags.find((x) => String(x.id) === q.get('id'));
        if (!a) throw new ApiError(404, 'Consulta não encontrada.');
        const n = Object.assign({}, a, body);
        if (!['cancelado', 'faltou'].includes(n.status)) validar(n.servico, n.data, n.hora, a.id, a.telefone);
        Object.assign(a, { servico: n.servico, data: n.data, hora: n.hora, status: n.status });
        const l = db.leads.find((x) => x.id === a.lead_id);
        if (l && body.status === 'confirmado') l.etapa = 'confirmado';
        return { agendamento: snap(a), alterado: true };
      }
      throw new ApiError(404, 'Rota inexistente.');
    }
    const CTX0 = [
      { id: 1, titulo: 'Triagem: qual médico para cada sintoma', conteudo: 'Dor no corpo (perna, costas, cabeça), febre, gripe, pressão, diabetes, check-up → clínico geral.\nDor de dente, limpeza, aparelho, implante → avaliação odontológica gratuita.\nCriança → pediatria (segunda, quarta e sexta de manhã).', categoria: 'triagem', ativo: true, ordem: 1 },
      { id: 2, titulo: 'Tom de voz', conteudo: 'Fale como a Maria da recepção: acolhedora, simples, sem termos técnicos. Paciente com pressa recebe resposta curta.', categoria: 'atendimento', ativo: true, ordem: 2 },
      { id: 3, titulo: 'Exames: preparo', conteudo: 'Não informe jejum nem preparo de exame. Diga que a recepção confirma o preparo na hora de agendar.', categoria: 'regras', ativo: true, ordem: 3 },
      { id: 4, titulo: 'Endereço e horário', conteudo: 'Atendemos de segunda a sexta, das 8h às 18h, e aos sábados até as 12h, em Sobradinho (DF).', categoria: 'informacoes', ativo: false, ordem: 4 }
    ].map((r) => Object.assign(r, { atualizado_em: new Date(Date.now() - 3600000 * 30).toISOString() }));
    let ctx = null;
    function rotaContexto(method, q, body) {
      if (!ctx) ctx = CTX0.map((r) => Object.assign({}, r));
      const ord = () => ctx.sort((a, b) => a.ordem - b.ordem || a.id - b.id);
      const id = +q.get('id');
      if (method === 'GET') return { regras: ord() };
      if (method === 'POST') { const r = Object.assign({ id: ++seq, ativo: true, ordem: Math.max(0, ...ctx.map((x) => x.ordem)) + 1, atualizado_em: new Date().toISOString() }, body); ctx.push(r); return { regra: r }; }
      if (method === 'DELETE') { ctx = ctx.filter((x) => x.id !== id); return { ok: true }; }
      const r = ctx.find((x) => x.id === id);
      if (!r) throw new ApiError(404, 'Regra não encontrada.');
      if (body.mover) { const l = ord(), i = l.indexOf(r), j = body.mover === 'up' ? i - 1 : i + 1; if (j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; } l.forEach((x, k) => { x.ordem = k + 1; }); return { regras: ord() }; }
      Object.assign(r, body, { atualizado_em: new Date().toISOString() });
      return { regra: r };
    }
    /* arquivos de demonstração: imagem SVG e áudio gerado na hora */
    function midiaDemo(arq) {
      if (/\.(wav|ogg|mp3)$/i.test(arq)) {
        const sr = 8000, n = sr * 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
        const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) { const t = i / sr, f = t < 1 ? 440 : 523; v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * f * t) * 3000 * Math.max(0, 1 - (t % 1)), true); }
        return Promise.resolve(new Blob([buf], { type: 'audio/wav' }));
      }
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="440"><rect width="640" height="440" fill="#F6F6F7"/><rect x="60" y="40" width="520" height="360" rx="14" fill="#fff" stroke="#E6E6EA"/><text x="90" y="95" font-family="Georgia,serif" font-size="30" fill="#1C1C21">Carteira de vacinação</text><g stroke="#D9161D" stroke-width="3" fill="none"><path d="M90 130h460M90 180h460M90 230h460M90 280h300"/></g><circle cx="500" cy="320" r="38" fill="#FCECEC" stroke="#D9161D" stroke-width="3"/><text x="478" y="330" font-family="Arial" font-size="26" fill="#A8141A">OK</text></svg>';
      return Promise.resolve(new Blob([svg], { type: 'image/svg+xml' }));
    }
    return {
      midia: (arq) => new Promise((res, rej) => setTimeout(() => { if (/offline/i.test(arq)) rej(new Error('offline')); else midiaDemo(arq).then(res, rej); }, 250)),
      handle(method, path, body) {
        if (!db) { db = seed(); setTimeout(() => { const l = db.leads.find((x) => x.nome === 'Helena Simulada'); if (l) { l.precisa_humano = true; l.atualizado_em = iso(0); } }, 25000); /* demonstra o alerta de humano */ }
        return new Promise((res, rej) => setTimeout(() => { try { res(JSON.parse(JSON.stringify(route(method, path, body || {})))); } catch (e) { rej(e); } }, 140));
      }
    };
  })();

  /* ---------- início ---------- */
  if (DEMO || getToken()) {
    if (!DEMO) { $('login').hidden = true; $('app').hidden = false; }
    start();
  } else showLogin();
})();
