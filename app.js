(() => {
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'patrimonio-matilde-v1';

// Pré-indexa para busca ultra rápida em O(1)
const ITEMS = window.PATRIMONIO.map(i => {
  const c = (i.n.split(/[\s.,]+/)[0] || '?').toUpperCase();
  const search_str = `${i.t} ${i.n} ${i.e}`.toLowerCase();
  return { ...i, c, search_str };
});
const BYT = Object.fromEntries(ITEMS.map(i => [i.t, i]));

const DEF = { st: {}, extras: [], log: [], resp: '', inst: 'EMEIEF MATILDE GUERRA COMÉRIO', loc: '', mode: 'L', theme: 'dark' };
let S = { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || 'null') || {}) };

const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => v.toLocaleString('pt-BR');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stOf = i => S.st[i.t]?.s || 'P';
const LAB = { P: '⏳ Pendente', L: '✅ Localizado', I: '⚠️ Inservível', N: '❌ Não localizado' };
const COL = { P: '#64748b', L: '#34d399', I: '#fbbf24', N: '#f87171' };
const yr = d => +(d || '').slice(6) || 0;
const hhmm = ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

document.documentElement.dataset.theme = S.theme;

/* ================= Áudio e Vibração Tátil ================= */
let actx;
function unlockAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  if (actx && actx.state === 'suspended') {
    actx.resume();
  }
}
window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
window.addEventListener('click', unlockAudio, { once: true, passive: true });

function beep(freq, duration = 0.1) {
  try {
    unlockAudio();
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, actx.currentTime);
    gain.gain.setValueAtTime(0.08, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + duration);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + duration);
  } catch (e) {}
}

function vibrate(pattern = 50) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

function toast(msg) {
  const t = $('#toast');
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= Persistência & Sincronização ================= */
let lastSyncJSON = '';
let syncDisabled = false;

const save = (syncRemote = true) => {
  const str = JSON.stringify(S);
  localStorage.setItem(KEY, str);
  if (syncRemote && !syncDisabled) {
    lastSyncJSON = str;
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: str
    }).catch(() => { syncDisabled = true; });
  }
};

async function syncFromServer() {
  if (syncDisabled) return;
  try {
    const res = await fetch('/api/state');
    if (!res.ok) {
      if (res.status === 404) syncDisabled = true; // Ambiente estático (Vercel)
      return;
    }
    const remote = await res.json();
    if (!remote || !remote.st) {
      if (Object.keys(S.st).length > 0) save(true);
      return;
    }
    const remoteStr = JSON.stringify(remote);
    if (remoteStr === lastSyncJSON) return;

    let changed = false;
    for (const [t, data] of Object.entries(remote.st || {})) {
      if (!S.st[t] || (data.ts && (!S.st[t].ts || data.ts > S.st[t].ts))) {
        S.st[t] = data;
        changed = true;
      }
    }
    if (Array.isArray(remote.extras)) {
      const existingIds = new Set(S.extras.map(x => x.id));
      for (const ex of remote.extras) {
        if (!existingIds.has(ex.id)) {
          S.extras.push(ex);
          changed = true;
        }
      }
    }
    if (remote.resp && !S.resp) { S.resp = remote.resp; changed = true; }
    if (remote.inst && !S.inst) { S.inst = remote.inst; changed = true; }
    if (changed) {
      lastSyncJSON = JSON.stringify(S);
      localStorage.setItem(KEY, lastSyncJSON);
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag !== 'input' && activeTag !== 'textarea') {
        refresh();
      }
    }
  } catch (e) {
    syncDisabled = true;
  }
}
setInterval(syncFromServer, 5000);
setTimeout(syncFromServer, 400);

// Suporte a teclado virtual no celular
window.addEventListener('focusin', e => {
  const t = (e.target?.tagName || '').toLowerCase();
  if (t === 'input' || t === 'textarea' || t === 'select') {
    document.body.classList.add('keyboard-open');
  }
});
window.addEventListener('focusout', () => {
  document.body.classList.remove('keyboard-open');
});

function setStatus(t, s, extra = {}) {
  if (s === 'P') delete S.st[t];
  else S.st[t] = { ...(S.st[t] || {}), s, ts: Date.now(), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) };
  save();
}

/* ================= Navegação ================= */
const TITLES = {
  conf: ['Conferência', 'Leia com a câmera ou digite o número da plaqueta'],
  dash: ['Painel Analítico', 'Visão geral do Termo de Guarda nº 000387/2026'],
  sobras: ['Sobras de Patrimônio', 'Bens encontrados que não constam no termo'],
  etq: ['Etiquetas QR Code', 'Gere e imprima etiquetas com QR Code'],
  rel: ['Relatórios & Backup', 'Exportar planilha, tabelas oficiais e backup']
};

let view = 'conf';
function go(v) {
  view = v;
  $$('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  $('#ptitle').textContent = TITLES[v][0];
  $('#psub').textContent = TITLES[v][1];
  refresh();
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (v === 'conf' && matchMedia('(min-width:900px)').matches) {
    $('#scan').focus();
  }
}
$$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.view));
$('#theme').onclick = () => {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = S.theme;
  save();
};

/* ================= Painel Analítico ================= */
function stats() {
  const c = { P: 0, L: 0, I: 0, N: 0 }, v = { P: 0, L: 0, I: 0, N: 0 };
  ITEMS.forEach(i => { const s = stOf(i); c[s]++; v[s] += i.v; });
  return { c, v };
}
function barRows(rows, max) {
  return rows.map(r => `<div class="bar"><span class="lb" title="${esc(r.l)}">${esc(r.l)}</span>
  <div class="tr">${r.seg.map(([k, n]) => `<div style="width:${n / max * 100}%;background:${COL[k]}" title="${LAB[k]}: ${n}"></div>`).join('')}</div>
  <span class="n">${num(r.tot)}</span></div>`).join('');
}
function group(keyFn, list = ITEMS) {
  const m = {};
  list.forEach(i => { const k = keyFn(i); const g = m[k] ||= { l: k, tot: 0, P: 0, L: 0, I: 0, N: 0 }; g.tot++; g[stOf(i)]++; });
  return Object.values(m).map(g => ({ ...g, seg: ['L', 'I', 'N', 'P'].map(k => [k, g[k]]) }));
}
function dash() {
  const { c, v } = stats(), tot = ITEMS.length, done = tot - c.P, pct = done / tot * 100;
  const totv = ITEMS.reduce((a, i) => a + i.v, 0);
  $('#kpis').innerHTML = [
    ['📦', 'Bens no termo', num(tot), brl(totv), '#7c5cff'],
    ['🎯', 'Conferidos', num(done), pct.toFixed(1) + '% concluído', '#22d3ee'],
    ['✅', 'Localizados', num(c.L), brl(v.L), '#34d399'],
    ['⚠️', 'Inservíveis', num(c.I), brl(v.I), '#fbbf24'],
    ['❌', 'Não localizados', num(c.N), brl(v.N), '#f87171'],
    ['⏳', 'Pendentes', num(c.P), brl(v.P), '#64748b'],
    ['➕', 'Sobras', num(S.extras.reduce((a, e) => a + e.q, 0)), 'fora do termo', '#a78bfa']
  ].map(k => `<div class="kpi" style="--c:${k[4]}"><div class="ic">${k[0]}</div><span>${k[1]}</span><b>${k[2]}</b><i>${k[3]}</i></div>`).join('');

  let acc = 0;
  const stops = ['L', 'I', 'N', 'P'].map(k => {
    const a = acc; acc += c[k] / tot * 100; return `${COL[k]} ${a}% ${acc}%`;
  });
  $('#ring').style.background = `conic-gradient(${stops.join(',')})`;
  $('#ringtxt').textContent = pct.toFixed(0) + '%';
  $('#legend').innerHTML = ['L', 'I', 'N', 'P'].map(k => `<li style="--c:${COL[k]}">${LAB[k]} <b>${num(c[k])}</b></li>`).join('');

  const cat = group(i => i.c).sort((a, b) => b.tot - a.tot).slice(0, 10);
  $('#bycat').innerHTML = barRows(cat, cat[0].tot);
  const dec = group(i => { const y = yr(i.a || i.d); return y ? Math.floor(y / 10) * 10 + 's' : 'sem data'; }).sort((a, b) => a.l.localeCompare(b.l));
  $('#bydec').innerHTML = barRows(dec, Math.max(...dec.map(d => d.tot)));

  const locs = {};
  ITEMS.forEach(i => { const l = S.st[i.t]?.loc; if (l) locs[l] = (locs[l] || 0) + 1; });
  const lr = Object.entries(locs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, n]) => ({ l, tot: n, seg: [['L', n]] }));
  $('#byloc').innerHTML = lr.length ? barRows(lr, lr[0].tot) : '<span class="muted">Informe o local nas conferências para ver o gráfico por sala.</span>';

  const old = ITEMS.filter(i => yr(i.a || i.d) && yr(i.a || i.d) <= new Date().getFullYear() - 20);
  const ins = [
    [`<b>${num(c.P)}</b> bens ainda pendentes (${brl(v.P)}).`, '#22d3ee'],
    [`<b>${num(old.length)}</b> bens com 20+ anos de tombamento (${(old.length / tot * 100).toFixed(0)}% do acervo).`, '#fbbf24']
  ];
  const tm = ITEMS.filter(i => /CHROMEBOOK|NOTEBOOK|IMPRESSORA|TELEVIS|PROJETOR|CAIXA DE SOM|COMPUTADOR|TABLET/.test(i.n));
  if (tm.length) ins.push([`<b>${tm.filter(i => stOf(i) === 'P').length}</b> de ${tm.length} eletrônicos pendentes.`, '#34d399']);
  $('#insights').innerHTML = ins.map(([h, c]) => `<li style="--c:${c}">${h}</li>`).join('');

  const topList = ITEMS.filter(i => stOf(i) === 'P').sort((a, b) => b.v - a.v).slice(0, 8);
  const isMobile = matchMedia('(max-width:900px)').matches;
  const mTop = $('#m-list-toppend');
  const tblTop = $('#toppend');
  if (isMobile) {
    if (tblTop) tblTop.style.display = 'none';
    if (mTop) {
      mTop.style.display = 'flex';
      mTop.innerHTML = topList.map(i => `
        <div class="m-item-card" data-t="${i.t}">
          <div class="m-item-top">
            <span class="m-tno">${i.t}</span>
            <span class="badge P">Pendente</span>
          </div>
          <div class="m-item-title">${esc(i.n)}</div>
          <div class="m-item-desc">${esc(i.e)}</div>
          <div class="m-item-footer">
            <div class="m-item-info">
              <span>💰 ${brl(i.v)}</span>
              ${i.a ? `<span>📅 ${i.a}</span>` : ''}
            </div>
            ${actBtns(i.t)}
          </div>
        </div>
      `).join('');
    }
  } else {
    if (mTop) mTop.style.display = 'none';
    if (tblTop) {
      tblTop.style.display = 'table';
      tblTop.innerHTML = '<tr><th>Tombamento</th><th>Bem</th><th>Aquisição</th><th>Valor</th></tr>' +
        topList.map(i => `<tr><td class="t">${i.t}</td><td><b>${esc(i.n)}</b><small>${esc(i.e)}</small></td><td data-l="Aquisição">${i.a || i.d}</td><td class="v" data-l="Valor">${brl(i.v)}</td></tr>`).join('');
    }
  }
}

function mini() {
  const done = ITEMS.filter(i => stOf(i) !== 'P').length, pct = done / ITEMS.length * 100;
  $('#mini-pct').textContent = pct.toFixed(0) + '%';
  $('#mini-fill').style.width = pct + '%';
  $('#mini-txt').textContent = `${num(done)} de ${num(ITEMS.length)} bens`;
}

/* ================= Conferência ================= */
let limit = 30;
let lastT = null;
let lastMissing = null;

const cats = [...new Set(ITEMS.map(i => i.c))].sort();
['#fcat', '#ecat'].forEach(s => {
  $(s).innerHTML = '<option value="">Todos os tipos</option>';
  cats.forEach(c => $(s).add(new Option(c, c)));
});

function filtered() {
  const q = $('#q').value.trim().toLowerCase();
  const fs = $('#fstatus').value;
  const fc = $('#fcat').value;
  const so = $('#fsort').value;

  const r = ITEMS.filter(i => {
    if (fs && stOf(i) !== fs) return false;
    if (fc && i.c !== fc) return false;
    if (q) {
      const loc = S.st[i.t]?.loc?.toLowerCase() || '';
      const obs = S.st[i.t]?.obs?.toLowerCase() || '';
      if (!i.search_str.includes(q) && !loc.includes(q) && !obs.includes(q)) return false;
    }
    return true;
  });

  const sortFns = {
    t: (a, b) => a.t.localeCompare(b.t),
    n: (a, b) => a.n.localeCompare(b.n) || a.t.localeCompare(b.t),
    vd: (a, b) => b.v - a.v,
    d: (a, b) => (yr(a.a || a.d) || 9999) - (yr(b.a || b.d) || 9999),
    r: (a, b) => (S.st[b.t]?.ts || 0) - (S.st[a.t]?.ts || 0)
  };
  return r.sort(sortFns[so] || sortFns.t);
}

const actBtns = t => `<div class="acts" data-t="${t}">
  <button data-s="L" class="btn sm" title="Marcar Localizado">✅</button>
  <button data-s="I" class="btn sm" title="Marcar Inservível">⚠️</button>
  <button data-s="N" class="btn sm" title="Marcar Não Localizado">❌</button>
  <button data-s="P" class="btn sm ghost" title="Limpar Status">↺</button>
  <button data-s="E" class="btn sm" title="Editar Sala e Obs">✏️</button>
</div>`;

function renderMobileCard(i) {
  const s = stOf(i), d = S.st[i.t] || {};
  return `<div class="m-item-card ${s !== 'P' ? 'checked' : ''}" data-t="${i.t}">
    <div class="m-item-top">
      <span class="m-tno">${i.t}</span>
      <span class="badge ${s}">${LAB[s]}</span>
    </div>
    <div class="m-item-title">${esc(i.n)}</div>
    <div class="m-item-desc">${esc(i.e)}</div>
    <div class="m-item-footer">
      <div class="m-item-info">
        <span>💰 ${brl(i.v)}</span>
        ${d.loc ? `<span>📍 ${esc(d.loc)}</span>` : ''}
        ${d.obs ? `<span>📝 ${esc(d.obs)}</span>` : ''}
      </div>
      ${actBtns(i.t)}
    </div>
  </div>`;
}

function renderDesktopRow(i) {
  const s = stOf(i), d = S.st[i.t] || {};
  return `<tr>
    <td class="t">${i.t}</td>
    <td><b>${esc(i.n)}</b><small>${esc(i.e)}</small></td>
    <td data-l="Aquisição">${i.a || '—'}</td>
    <td class="v" data-l="Valor">${brl(i.v)}</td>
    <td><span class="badge ${s}">${LAB[s]}</span></td>
    <td>${d.loc ? '📍 ' + esc(d.loc) : ''}<small>${esc(d.obs || '')}</small></td>
    <td>${actBtns(i.t)}</td>
  </tr>`;
}

function conf() {
  const r = filtered();
  const show = r.slice(0, limit);
  $('#resinfo').textContent = `${num(r.length)} bens no filtro · ${brl(r.reduce((a, i) => a + i.v, 0))}`;

  const isMobile = matchMedia('(max-width:900px)').matches;
  const tbl = $('#tbl');
  const mList = $('#m-list-conf');
  if (isMobile) {
    if (tbl) tbl.style.display = 'none';
    if (mList) {
      mList.style.display = 'flex';
      mList.innerHTML = show.map(renderMobileCard).join('');
    }
  } else {
    if (mList) mList.style.display = 'none';
    if (tbl) {
      tbl.style.display = 'table';
      tbl.innerHTML = '<tr><th>Tombamento</th><th>Bem</th><th>Aquisição</th><th>Valor</th><th>Status</th><th>Local / Obs.</th><th>Ações</th></tr>' +
        show.map(renderDesktopRow).join('');
    }
  }

  $('#more').hidden = r.length <= limit;
  $('#more').textContent = `Carregar mais itens (${num(r.length - limit)} restantes)`;
  renderLast();
  renderLog();
}

function rowAction(t, s) {
  vibrate(40);
  if (s === 'E') return edit(t);
  if (s === 'Q') return showQR(t);
  setStatus(t, s, s === 'L' || s === 'I' ? { loc: S.st[t]?.loc || S.loc || undefined } : {});
  if (s !== 'P') addLog(t, s);
  refresh();
}

document.addEventListener('click', e => {
  const b = e.target.closest('.acts[data-t] button');
  if (!b) return;
  rowAction(b.parentNode.dataset.t, b.dataset.s);
});

function edit(t) {
  const d = S.st[t] || {};
  $('#dtitle').textContent = `${t} — ${BYT[t].n}`;
  $('#d-loc').value = d.loc || S.loc || '';
  $('#d-obs').value = d.obs || '';
  const dl = $('#dlg');
  dl.dataset.t = t;
  dl.returnValue = '';
  dl.showModal();
}

$('#dlg').onclose = () => {
  const dl = $('#dlg');
  if (dl.returnValue !== 'ok') return;
  const t = dl.dataset.t;
  S.st[t] = {
    ...(S.st[t] || { s: 'L' }),
    loc: $('#d-loc').value.trim(),
    obs: $('#d-obs').value.trim(),
    ts: Date.now()
  };
  save();
  refresh();
  toast('💾 Salvo com sucesso');
};

let searchDebounce = null;
$('#q').oninput = () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { limit = 30; conf(); }, 120);
};

['#fstatus', '#fcat', '#fsort'].forEach(s => {
  $(s).onchange = () => { limit = 30; conf(); };
});

$('#more').onclick = () => { limit += 40; conf(); };

$$('[data-bulk]').forEach(b => b.onclick = () => {
  const r = filtered(), k = b.dataset.bulk, tg = k === 'N' ? r.filter(i => stOf(i) === 'P') : r;
  if (!tg.length) return toast('Nada a alterar no filtro');
  if (!confirm(`Aplicar "${LAB[k]}" a ${tg.length} bens filtrados?`)) return;
  tg.forEach(i => setStatus(i.t, k, k === 'L' ? { loc: S.st[i.t]?.loc || S.loc || undefined } : {}));
  refresh();
});

/* ================= Modo & Local ================= */
function renderMode() {
  $$('[data-mode-seg] button').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
}
$$('[data-mode-seg] button').forEach(b => b.onclick = () => {
  vibrate(30);
  S.mode = b.dataset.m;
  save();
  renderMode();
});

$('#curloc').value = S.loc || '';
$('#curloc').oninput = e => {
  S.loc = e.target.value.trim();
  save();
  $('#camloc').textContent = S.loc || 'Não definida';
};

/* ================= Processamento de Código ================= */
function parseCode(txt) {
  const m = String(txt).match(/(\d{1,9})(?!.*\d)/s);
  return m ? m[1].padStart(9, '0') : null;
}
function addLog(t, k) {
  S.log.unshift({ t, k, ts: Date.now() });
  S.log = S.log.slice(0, 50);
  save();
}

function processCode(raw) {
  const t = parseCode(raw);
  if (!t) {
    beep(200, 0.2);
    vibrate([100, 50, 100]);
    return { cls: 'er', html: `Código não reconhecido: <b>${esc(raw)}</b>` };
  }
  const it = BYT[t];
  if (!it) {
    beep(220, 0.25);
    vibrate([120, 60, 120]);
    addLog(t, 'X');
    lastT = null;
    lastMissing = t;
    refresh();
    return { cls: 'er', html: `❌ <b>${t}</b> NÃO consta no termo. Registre em <b>Sobras</b>.` };
  }
  lastMissing = null;
  lastT = t;
  const prev = stOf(it);
  if (prev === 'L' || prev === 'I') {
    beep(340, 0.15);
    vibrate([80, 50, 80]);
    addLog(t, 'D');
    refresh();
    return { cls: 'wr', html: `🔁 <b>${t}</b> — ${esc(it.n)}<br>já estava como ${LAB[prev]}` };
  }

  setStatus(t, S.mode, { loc: S.loc || undefined });
  addLog(t, S.mode);
  beep(880, 0.12);
  vibrate([50, 30, 80]);
  refresh();
  return {
    cls: 'ok',
    html: `${S.mode === 'L' ? '✅' : '⚠️'} <b>${t}</b> — ${esc(it.n)}<br><small>${esc(it.e.slice(0, 85))}</small>`
  };
}

function submitMainScan() {
  const raw = $('#scan').value.trim();
  if (!raw) { $('#scan').focus(); return; }
  $('#scan').value = '';
  processCode(raw);
}
$('#scan').onkeydown = e => { if (e.key === 'Enter') submitMainScan(); };
$('#btn-submit-scan').onclick = submitMainScan;

function submitCamManual() {
  const raw = $('#cam-scan-input').value.trim();
  if (!raw) { $('#cam-scan-input').focus(); return; }
  $('#cam-scan-input').value = '';
  const r = processCode(raw);
  camFeed(r.html, r.cls);
  if (r.cls === 'ok') camSession++;
  $('#camcount').textContent = camSession ? `🎯 ${camSession} item(ns) conferido(s)` : '';
}
$('#cam-scan-input').onkeydown = e => { if (e.key === 'Enter') submitCamManual(); };
$('#btn-cam-manual').onclick = submitCamManual;

function renderLast() {
  const el = $('#last');
  if (lastMissing) {
    el.className = 'last er';
    el.innerHTML = `<div class="lt">
      <div>
        <span class="tno">${lastMissing}</span>
        <h4>Não consta no Termo de Guarda</h4>
        <div class="meta">Este número não está no documento oficial.</div>
      </div>
    </div>
    <div class="actions">
      <button class="btn sm primary" id="addx">➕ Registrar em Sobras</button>
    </div>`;
    $('#addx').onclick = () => {
      go('sobras');
      $('#s-t').value = lastMissing;
      $('#s-l').value = S.loc;
      $('#s-n').focus();
    };
    return;
  }
  if (!lastT) {
    el.className = 'last';
    el.innerHTML = '<div class="muted center-t">📡 Aguardando código… Aponte a câmera ou digite o número acima.</div>';
    return;
  }
  const i = BYT[lastT], s = stOf(i), d = S.st[i.t] || {};
  el.className = 'last ' + (s === 'L' ? 'ok' : s === 'P' ? '' : s === 'I' ? 'wr' : 'er');
  el.innerHTML = `<div class="lt">
    <div>
      <span class="tno">${i.t}</span>
      <h4>${esc(i.n)}</h4>
      <div class="meta">${esc(i.e)}</div>
      <div class="meta">Aquisição ${i.a || '—'} · ${brl(i.v)}${d.loc ? ' · 📍 ' + esc(d.loc) : ''}${d.obs ? ' · 📝 ' + esc(d.obs) : ''}</div>
    </div>
    <span class="badge ${s}">${LAB[s]}</span>
  </div>${actBtns(i.t)}`;
}

const LOGI = {
  L: ['✅', 'var(--ok)', 'Localizado'],
  I: ['⚠️', 'var(--wr)', 'Inservível'],
  N: ['❌', 'var(--er)', 'Não localizado'],
  D: ['🔁', 'var(--mu)', 'Já conferido'],
  X: ['❓', 'var(--er)', 'Fora do termo']
};

function renderLog() {
  $('#log').innerHTML = S.log.length ? S.log.slice(0, 30).map(l => {
    const [ic, c, txt] = LOGI[l.k] || LOGI.D, it = BYT[l.t];
    return `<li>
      <span class="ld" style="background:color-mix(in srgb,${c} 18%,transparent)">${ic}</span>
      <div><b>${l.t}</b><span>${esc(it ? it.n : txt)} · ${txt}</span></div>
      <time>${hhmm(l.ts)}</time>
    </li>`;
  }).join('') : '<li class="empty">Nenhuma leitura ainda</li>';
}
$('#clearlog').onclick = () => { S.log = []; save(); renderLog(); };

/* ================= Câmera Imersiva ================= */
let qr = null, lastCode = '', lastTime = 0, camSession = 0;
const camFeed = (h, c = '') => { const f = $('#camfeed'); f.className = 'feed ' + c; f.innerHTML = h; };

async function openCam() {
  unlockAudio();
  vibrate(40);
  $('#camloc').textContent = S.loc || 'Não definida';
  renderMode();
  camSession = 0;
  $('#camcount').textContent = '';
  $('#cam-scan-input').value = '';
  camFeed('Aponte para o código de barras ou QR Code da plaqueta.');
  $('#camdlg').showModal();

  if (!window.Html5Qrcode) {
    return camFeed('Biblioteca da câmera não encontrada. Digite o número no campo abaixo.', 'er');
  }

  try {
    const formatsToSupport = window.Html5QrcodeSupportedFormats ? [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.UPC_A
    ] : undefined;

    qr ||= new Html5Qrcode('reader', { formatsToSupport, verbose: false });
    await startCam($('#camsel').value || null);
    if (!$('#camsel').options.length) {
      const cams = await Html5Qrcode.getCameras();
      $('#camsel').innerHTML = cams.map(c => `<option value="${esc(c.id)}">${esc(c.label || 'Câmera')}</option>`).join('');
      $('#camsel').value = '';
      $('#camsel').hidden = cams.length < 2;
    }
  } catch (e) {
    camFeed('Câmera indisponível: ' + esc(e?.message || e) + '<br><b>Você pode digitar o número no campo abaixo.</b>', 'er');
  }
}

async function startCam(id) {
  if (qr.isScanning) await qr.stop();
  await qr.start(
    id || { facingMode: 'environment' },
    { fps: 15, qrbox: (w, h) => ({ width: Math.floor(w * 0.88), height: Math.floor(Math.min(h * 0.6, 220)) }) },
    onCode,
    () => {}
  );
}

function onCode(text) {
  const now = Date.now();
  if (text === lastCode && now - lastTime < 2800) return;
  lastCode = text;
  lastTime = now;

  const r = processCode(text);
  camFeed(r.html, r.cls);
  if (r.cls === 'ok') {
    camSession++;
    $('#camcount').textContent = `🎯 ${camSession} item(ns) conferido(s) nesta sessão`;
  }
}

async function closeCam() {
  vibrate(30);
  try { if (qr?.isScanning) await qr.stop(); } catch (e) {}
  $('#camdlg').close();
  if (camSession) toast(`✅ ${camSession} item(ns) conferido(s) pela câmera`);
}

$('#camsel').onchange = e => startCam(e.target.value).catch(err => camFeed(esc(err?.message || err), 'er'));
$('#camclose').onclick = closeCam;
$('#camdlg').addEventListener('cancel', e => { e.preventDefault(); closeCam(); });
$('#cam-btn').onclick = openCam;
$('#quick-cam').onclick = () => { if (view !== 'conf') go('conf'); openCam(); };

/* ================= Conectar Celular ================= */
async function openMobileConnect() {
  const dlg = $('#mobiledlg');
  let ip = window.location.hostname;
  let port = '8443';
  try {
    const res = await fetch('/api/ip');
    if (res.ok) {
      const data = await res.json();
      if (data.ip && data.ip !== '127.0.0.1') ip = data.ip;
      if (data.https_port) port = data.https_port;
    }
  } catch (e) {}

  const mobileUrl = `https://${ip}:${port}/index.html`;
  const q = qrcode(0, 'M');
  q.addData(mobileUrl);
  q.make();
  $('#mobile-qr-img').src = q.createDataURL(6, 12);
  
  const linkEl = $('#mobile-link');
  linkEl.href = mobileUrl;
  linkEl.textContent = mobileUrl;
  
  dlg.showModal();
}
$('#btn-mobile-connect').onclick = openMobileConnect;

/* ================= Etiquetas (Otimizado) ================= */
const qrCache = {};
function qrURL(t, cell = 5) {
  const k = t + '_' + cell;
  if (qrCache[k]) return qrCache[k];
  const q = qrcode(0, 'M');
  q.addData(t);
  q.make();
  return qrCache[k] = q.createDataURL(cell, cell * 2);
}
function labelHTML(i) {
  const desc = $('#edesc').checked, inst = $('#einst').checked;
  return `<div class="lab">
    <img src="${qrURL(i.t)}" alt="QR ${i.t}">
    <div class="lab-tx">
      ${inst ? `<small>${esc(S.inst)}</small>` : '<small>Patrimônio</small>'}
      <b>${i.t}</b>
      ${desc ? `<span>${esc(i.n)}</span>` : ''}
    </div>
  </div>`;
}
function etqList() {
  const q = $('#eq').value.trim().toLowerCase(), c = $('#ecat').value, s = $('#estatus').value;
  const f = +$('#efrom').value.replace(/\D/g, '') || 0, to = +$('#eto').value.replace(/\D/g, '') || Infinity;
  return ITEMS.filter(i => (!c || i.c === c) && (!s || stOf(i) === s) && +i.t >= f && +i.t <= to &&
    (!q || (i.t + ' ' + i.n + ' ' + i.e).toLowerCase().includes(q))).sort((a, b) => a.t.localeCompare(b.t));
}
function etq() {
  const l = etqList(), cols = $('#esize').value;
  const max = matchMedia('(max-width:900px)').matches ? 12 : 24;
  $('#einfo').textContent = `${num(l.length)} etiquetas no filtro`;
  const p = $('#epreview');
  p.style.cssText = `--cols:${cols}`;
  p.innerHTML = l.slice(0, max).map(labelHTML).join('') +
    (l.length > max ? `<div class="more-lab">Mostrando prévia de ${max} itens (${num(l.length - max)} restantes). Na impressão saem todos.</div>` : '') ||
    '<div class="more-lab">Nenhum bem no filtro.</div>';
}
['#eq', '#ecat', '#estatus', '#efrom', '#eto', '#esize', '#edesc', '#einst'].forEach(s => $(s).oninput = etq);

async function printLabels(list, cols) {
  if (!list.length) return toast('Nenhuma etiqueta para imprimir');
  if (list.length > 300 && !confirm(`Imprimir ${list.length} etiquetas?`)) return;
  const pa = $('#printarea');
  pa.innerHTML = `<div class="labels" style="--cols:${cols}">${list.map(labelHTML).join('')}</div>`;
  await Promise.all([...pa.querySelectorAll('img')].map(im => im.decode?.().catch(() => {})));
  window.print();
}
$('#eprint').onclick = () => printLabels(etqList(), $('#esize').value);
function showQR(t) {
  const i = BYT[t];
  $('#qrtitle').textContent = '🏷️ ' + t;
  $('#qrimg').src = qrURL(t, 8);
  $('#qrdesc').textContent = i.n + ' — ' + i.e;
  $('#qrdlg').dataset.t = t;
  $('#qrdlg').showModal();
}
$('#qrprint').onclick = () => {
  const t = $('#qrdlg').dataset.t;
  $('#qrdlg').close();
  printLabels([BYT[t]], 3);
};

/* ================= Sobras ================= */
$('#fsob').onsubmit = e => {
  e.preventDefault();
  vibrate(50);
  S.extras.push({
    id: Date.now(),
    t: $('#s-t').value.trim(),
    n: $('#s-n').value.trim(),
    q: Math.max(1, +$('#s-q').value || 1),
    loc: $('#s-l').value.trim(),
    obs: $('#s-o').value.trim()
  });
  save();
  e.target.reset();
  $('#s-q').value = 1;
  $('#s-l').value = S.loc;
  refresh();
  toast('➕ Adicionado à Tabela 2');
};

function sobras() {
  $('#s-l').value ||= S.loc;
  const isMobile = matchMedia('(max-width:900px)').matches;
  const tbl = $('#tsob');
  const mList = $('#m-list-sobras');
  if (isMobile) {
    if (tbl) tbl.style.display = 'none';
    if (mList) {
      mList.style.display = 'flex';
      mList.innerHTML = S.extras.length ? S.extras.map((x, k) => `
        <div class="m-item-card">
          <div class="m-item-top">
            <span class="m-tno">${esc(x.t) || 'S/ Tombamento'}</span>
            <span class="badge L">Qtd: ${x.q}</span>
          </div>
          <div class="m-item-title">${esc(x.n)}</div>
          <div class="m-item-meta">
            ${x.loc ? `<span>📍 ${esc(x.loc)}</span>` : ''}
            ${x.obs ? `<span>📝 ${esc(x.obs)}</span>` : ''}
          </div>
          <div class="m-item-actions">
            <button data-x="${x.id}" class="btn sm danger" title="Remover">🗑️ Excluir</button>
          </div>
        </div>
      `).join('') : '<div class="muted center-t" style="padding:30px">Nenhum bem extra cadastrado.</div>';
    }
  } else {
    if (mList) mList.style.display = 'none';
    if (tbl) {
      tbl.style.display = 'table';
      tbl.innerHTML = '<tr><th>Nº</th><th>Tombamento</th><th>Descrição</th><th>Qtd</th><th>Local</th><th>Observação</th><th></th></tr>' +
        (S.extras.map((x, k) => `<tr>
          <td>${k + 1}</td>
          <td class="t">${esc(x.t) || '—'}</td>
          <td><b>${esc(x.n)}</b></td>
          <td>${x.q}</td>
          <td>${esc(x.loc)}</td>
          <td>${esc(x.obs)}</td>
          <td><div class="acts"><button data-x="${x.id}" title="Remover">🗑️</button></div></td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted center-t" style="padding:24px">Nenhum bem extra registrado.</td></tr>');
    }
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-x]');
  if (!b) return;
  vibrate(40);
  if (!confirm('Remover este item?')) return;
  S.extras = S.extras.filter(x => x.id != b.dataset.x);
  save();
  refresh();
});

/* ================= Relatórios ================= */
$('#r-inst').value = S.inst;
$('#r-resp').value = S.resp;
$('#r-inst').oninput = e => { S.inst = e.target.value; save(); };
$('#r-resp').oninput = e => { S.resp = e.target.value; save(); };

const sel = s => ITEMS.filter(i => stOf(i) === s);
const REP = {
  t1: {
    title: 'TABELA 1',
    sub: 'BENS CONSTANTES NO TERMO DE GUARDA, PORÉM NÃO FORAM LOCALIZADOS NA INSTITUIÇÃO.',
    head: ['Nº', 'Tombamento', 'Descrição', 'Aquisição', 'Valor', 'Observação'],
    rows: () => sel('N').map((i, k) => [k + 1, i.t, i.n + ' — ' + i.e, i.a, brl(i.v), S.st[i.t]?.obs || ''])
  },
  t2: {
    title: 'TABELA 2',
    sub: 'BENS QUE FORAM LOCALIZADOS NA INSTITUIÇÃO, PORÉM NÃO CONSTAM NO TERMO DE GUARDA.',
    head: ['Nº', 'Tombamento', 'Descrição', 'Qtd', 'Local', 'Observação'],
    rows: () => S.extras.map((x, k) => [k + 1, x.t, x.n, x.q, x.loc, x.obs])
  },
  t3: {
    title: 'TABELA 3',
    sub: 'BENS QUE ESTÃO NA INSTITUIÇÃO, PORÉM ESTÃO INSERVÍVEIS (DEGRADADOS, QUEBRADOS E EM DESUSO).',
    head: ['Nº', 'Tombamento', 'Descrição', 'Local', 'Valor', 'Observação'],
    rows: () => sel('I').map((i, k) => [k + 1, i.t, i.n + ' — ' + i.e, S.st[i.t]?.loc || '', brl(i.v), S.st[i.t]?.obs || ''])
  }
};

function rel() {
  $('#rc-t1').textContent = `${num(sel('N').length)} itens`;
  $('#rc-t2').textContent = `${num(S.extras.length)} itens`;
  $('#rc-t3').textContent = `${num(sel('I').length)} itens`;
}

function printRep(k) {
  let h;
  if (k === 'resumo') {
    const { c, v } = stats();
    h = `<h2>RESUMO DA CONFERÊNCIA DE PATRIMÔNIO</h2>
    <p><b>Instituição:</b> ${esc(S.inst)}</p>
    <p><b>Termo de Guarda nº 000387/2026</b> · ${num(ITEMS.length)} bens</p>
    <table>
      <tr><th>Situação</th><th>Qtd</th><th>Valor</th></tr>
      ${['L', 'I', 'N', 'P'].map(s => `<tr><td>${LAB[s]}</td><td>${c[s]}</td><td>${brl(v[s])}</td></tr>`).join('')}
      <tr><td>Sobras fora do termo</td><td>${S.extras.reduce((a, e) => a + e.q, 0)}</td><td>—</td></tr>
    </table>`;
  } else {
    const r = REP[k], rows = r.rows(), min = Math.max(0, 15 - rows.length);
    h = `<h2>${r.title}</h2><p><b>${r.sub}</b></p><p>NOME DA INSTITUIÇÃO: ${esc(S.inst)}</p>
    <table>
      <tr>${r.head.map(x => `<th>${x}</th>`).join('')}</tr>
      ${rows.map(x => `<tr>${x.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
      ${Array.from({ length: min }, (_, n) => `<tr><td>${String(rows.length + n + 1).padStart(2, '0')}</td>${'<td>&nbsp;</td>'.repeat(r.head.length - 1)}</tr>`).join('')}
    </table>`;
  }
  h += `<div class="sig">
    <p>Responsável pela conferência: ${esc(S.resp) || '_'.repeat(40)}</p>
    <p>Assinatura: ${'_'.repeat(50)}</p>
  </div>`;
  $('#printarea').innerHTML = h;
  window.print();
}

$$('[data-print]').forEach(b => b.onclick = () => printRep(b.dataset.print));

function dl(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type }));
  a.download = name;
  a.click();
}
const csv = rows => rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');

$$('[data-csv]').forEach(b => b.onclick = () => {
  vibrate(30);
  const k = b.dataset.csv;
  if (k === 'tudo') {
    return dl('patrimonio_completo.csv', csv([
      ['Tombamento', 'Bem', 'Especificação', 'Data aquisição', 'Data tombamento', 'Valor', 'Status', 'Local', 'Observação', 'Conferido em'],
      ...ITEMS.map(i => {
        const d = S.st[i.t] || {};
        return [i.t, i.n, i.e, i.a, i.d, i.v.toFixed(2).replace('.', ','), LAB[stOf(i)].slice(2).trim(), d.loc, d.obs, d.ts ? new Date(d.ts).toLocaleString('pt-BR') : ''];
      })
    ]));
  }
  const r = REP[k];
  dl(`${r.title.toLowerCase().replace(' ', '')}.csv`, csv([r.head, ...r.rows()]));
});

$('#bk').onclick = () => {
  vibrate(30);
  dl(`backup_patrimonio_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S), 'application/json');
};
$('#rs').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then(t => {
    try {
      S = { ...DEF, ...JSON.parse(t.replace(/^\ufeff/, '')) };
      save();
      location.reload();
    } catch {
      toast('Arquivo inválido');
    }
  });
};
$('#reset').onclick = () => {
  if (confirm('Apagar TODO o progresso da conferência?') && confirm('Tem certeza? Faça backup antes.')) {
    localStorage.removeItem(KEY);
    location.reload();
  }
};

/* ================= Render Principal ================= */
function refresh() {
  $('#cnt-sobras').textContent = S.extras.length;
  $('#locs').innerHTML = [...new Set([...Object.values(S.st).map(x => x.loc), ...S.extras.map(x => x.loc)].filter(Boolean))].map(l => `<option value="${esc(l)}">`).join('');
  mini();
  ({ dash, conf, etq, sobras, rel })[view]();
}

renderMode();

// Se for celular, abre direto na aba de Conferência
const initialView = matchMedia('(max-width:900px)').matches ? 'conf' : 'dash';
go(initialView);

// Atualiza renderização ao rotacionar tela
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(refresh, 150);
});
})();
