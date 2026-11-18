/* ============================================================
   app.js — Péndulo TRRL: toma de datos en campo (offline)
   ============================================================ */
'use strict';

/* ---------- Almacenamiento local ---------- */
const LS_KEY = 'pendulo_trrl_v1';
function loadDB() {
  try { const s = localStorage.getItem(LS_KEY); if (s) { const d = JSON.parse(s); if (d && Array.isArray(d.mediciones)) { d.concesiones = d.concesiones || []; return d; } } } catch (e) { }
  return { v: 1, mediciones: [], concesiones: [] };
}
let DB = loadDB(), _saveT = null;
function saveNow() { clearTimeout(_saveT); try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch (e) { toast('No se pudo guardar en el teléfono (almacenamiento lleno).'); } }
function save() { clearTimeout(_saveT); _saveT = setTimeout(saveNow, 250); }
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

/* ---------- Utilidades ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const fmtProg = m => Math.floor(m / 1000) + '+' + String(m % 1000).padStart(3, '0');
const fix = (v, n) => (v === null || v === undefined || v === '') ? '—' : Number(v).toFixed(n);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 3200); }

/* ---------- Modelo de datos ---------- */
const newPunto = u => { const p = { d: ['', '', '', '', ''], i: ['', '', '', '', ''], ta: '', tw: '', cf: [] }; if (u !== undefined) p.u = u; return p; };
const newPuente = (nombre, prog) => ({ id: uid(), nombre, prog, fotos: [null, null], puntos: ['INICIO', 'MEDIO ', 'FIN'].map(newPunto) });
const newKm = (km, calzada) => ({ id: uid(), km, calzada, puntos: Array.from({ length: 11 }, () => { const p = newPunto(); p.fotos = [null, null]; return p; }) });

/* Catálogo de concesiones con ensayo de péndulo (según la carpeta PENDULO) */
const CATALOGO = [
  { corto: 'Autopista del Sol', tipo: 'km', titulo: 'Autopista del Sol: Trujillo - Sullana',
    sub: [[1, 'Trujillo inicio - Chicama'], [2, 'Chicama - Paijan'], [3, 'Paijan - San Pedro de Lloc'], [4, 'San Pedro de Lloc - Pacasmayo'], [5, 'Pacasmayo - Guadalupe'], [6, 'Guadalupe - Chepén'], [7, 'Chepén - Mocupe'], [8, 'Mocupe - Reque'], [9, 'Reque - Chiclayo'], [10, 'Chiclayo - Piura (lado izquierdo)'], [11, 'Piura - Sullana']] },
  { corto: 'IIRSA Centro', tipo: 'km', titulo: 'IIRSA Centro - Tramo 2: Pte. Ricardo Palma - La Oroya -Huancayo y La Oroya - Dv. Cerro de Pasco',
    sub: [[1, 'Pte. Ricardo Palma - La Oroya'], [2, 'La Oroya - Huancayo'], [3, 'La Oroya - Dv. Cerro de Pasco']] },
  { corto: 'Dv. Quilca - La Concordia', tipo: 'puentes', titulo: 'Dv. Quilca - Dv. Arequipa - Dv. Matarani - Dv. Moquegua - Dv. Ilo - Tacna - La Concordia',
    sub: [[1, 'Dv. Quilca - Dv. Arequipa (Repartición)'], [2, 'Dv. Matarani - Dv. Moquegua'], [3, 'Dv. Ilo - Tacna'], [4, 'Tacna - La Concordia']] },
  { corto: 'Long de la Sierra T2', tipo: 'puentes', titulo: 'Carretera Longitudinal de la Sierra Tramo 2: Ciudad de Dios - Cajamarca - Chiple, Cajamarca - Trujillo y Dv. Chilete - Emp. PE-3N',
    sub: [[1, 'Chiple - Cutervo'], [2, 'Cutervo - Cochabamba'], [3, 'Cochabamba - Chota'], [4, 'Chota - Hualgayoc'], [5, 'Hualgayoc - Dv. Yanacocha'], [6, 'Dv. Yanacocha - Cajamarca'], [7, 'Cajamarca - Km 1269+00'], [8, 'Km 1269+00 - San Marcos'], [9, 'San Marcos - Cajabamba'], [10, 'Cajabamba - Sausacocha'], [11, 'Sausacocha - Huamachuco'], [12, 'Huamachuco - Dv. Callacuyan'], [13, 'Dv. Callacuyan - Shorey'], [14, 'Shorey - Dv. Otuzco'], [15, 'Dv. Otuzco - Trujillo'], [16, 'Ciudad de Dios - Dv. Chilete'], [17, 'Dv. Chilete - Cajamarca'], [18, 'Dv. Chilete - Emp. PE-3N']] }
];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

/* Validación: rangos admitidos y datos obligatorios */
const RL = [20, 70], RT = [0, 40];
const rngOf = k => (k === 'ta' || k === 'tw') ? RT : RL;
const FLAB = k => k === 'ta' ? 'Temperatura ambiente' : k === 'tw' ? 'Temperatura del agua' : (k[0] === 'd' ? 'Carril derecho' : 'Carril izquierdo') + ' L' + (Number(k[1]) + 1);
const valOf = (p, k) => (k === 'ta' || k === 'tw') ? p[k] : p[k[0]][Number(k[1])];
function outRange(k, v) { const n = numOf(v), r = rngOf(k); return n === null || n < r[0] || n > r[1]; }
function pIssues(p) {
  const miss = [], bad = [], cf = p.cf || [];
  const chk = (k, v) => { if (v === '') { miss.push(k); return; } if (outRange(k, v) && !cf.includes(k)) bad.push(k); };
  p.d.forEach((v, j) => chk('d' + j, v)); p.i.forEach((v, j) => chk('i' + j, v)); chk('ta', p.ta); chk('tw', p.tw);
  return { miss, bad };
}
const CALZ = { UNICA: 'Calzada única', DERECHA: 'Calzada derecha', IZQUIERDA: 'Calzada izquierda' };

function pState(p) {
  const n = [...p.d, ...p.i].filter(v => v !== '').length + (p.ta !== '' ? 1 : 0) + (p.tw !== '' ? 1 : 0);
  if (n === 0) return 'e';
  const q = pIssues(p); if (q.bad.length) return 'w';
  return q.miss.length ? 'p' : 'c';
}
function medStats(m) {
  let w = 0, fotos = 0, fotosT = 0;
  m.subtramos.forEach(s => s.items.forEach(it => {
    if (m.tipo === 'km') it.puntos.forEach(p => { fotosT += 2; fotos += (p.fotos || []).filter(Boolean).length; }); else { fotosT += 2; fotos += (it.fotos || []).filter(Boolean).length; }
    it.puntos.forEach(p => { if (pState(p) === 'w') w++; });
  }));
  return { w, fotos, fotosT };
}
function itemProg(it) { let c = 0; it.puntos.forEach(p => { if (pState(p) === 'c') c++; }); return { c, t: it.puntos.length }; }
function subProg(s) { let c = 0, t = 0; s.items.forEach(it => { const x = itemProg(it); c += x.c; t += x.t; }); return { c, t }; }
function medProg(m) { let c = 0, t = 0; m.subtramos.forEach(s => { const x = subProg(s); c += x.c; t += x.t; }); return { c, t }; }
function badge(x) { const cls = x.t === 0 ? 'e' : x.c === x.t ? 'c' : x.c === 0 ? 'e' : 'p'; return '<span class="bd ' + cls + '">' + x.c + '/' + x.t + '</span>'; }

/* ---------- Navegación ---------- */
let V = { name: 'home' };
function go(v) { V = v; history.pushState({ v }, ''); render(); window.scrollTo(0, 0); }
function redo(v) { V = v; history.replaceState({ v }, ''); render(); }
window.addEventListener('popstate', e => { V = (e.state && e.state.v) || { name: 'home' }; render(); });
history.replaceState({ v: V }, '');
const med = () => DB.mediciones.find(m => m.id === V.m);
const sub = () => { const m = med(); return m && m.subtramos.find(s => s.id === V.s); };
const itm = () => { const s = sub(); return s && s.items.find(i => i.id === V.i); };

/* ---------- Ventanas (modal) ---------- */
function modal(o) {
  const root = $('#modal'); root.innerHTML =
    '<div class="mb"><h3>' + esc(o.title) + '</h3><form id="mf">' + o.body + '<div class="mbtn">' +
    (o.cancel === false ? '' : '<button type="button" class="btn sec" data-mc>' + esc(o.cancelText || 'Cancelar') + '</button>') +
    (o.ok ? '<button type="submit" class="btn ' + (o.danger ? 'dg' : '') + '">' + esc(o.ok) + '</button>' : '') + '</div></form></div>';
  root.classList.add('on');
  const close = () => { root.classList.remove('on'); root.innerHTML = ''; };
  root.querySelectorAll('[data-mc]').forEach(b => b.onclick = close);
  if (o.init) o.init(root);
  $('#mf').onsubmit = async ev => {
    ev.preventDefault(); if (!o.onOk) { close(); return; }
    const r = await o.onOk(new FormData(ev.target), root); if (r !== false) close();
  };
  const f = root.querySelector('input:not([type=radio]),textarea,select'); if (f && o.focus !== false) setTimeout(() => f.focus(), 60);
  return close;
}
function confirmBox(title, msg, ok) { return new Promise(res => { modal({ title, body: '<p>' + msg + '</p>', ok: ok || 'Aceptar', danger: true, onOk: () => { res(true); }, focus: false }); $('#modal [data-mc]').addEventListener('click', () => res(false)); }); }
function alertBox(title, msg) { modal({ title, body: '<p>' + msg + '</p>', ok: 'Entendido', cancel: false, focus: false }); }

/* ---------- Render ---------- */
function topbar(title, back, right) {
  return '<header class="tb">' + (back ? '<button class="ib" data-act="back" aria-label="Atrás">&#8592;</button>' : '') + '<div class="tt">' + esc(title) + '</div>' + (right || '') + '</header>';
}
function render() {
  const a = $('#app');
  if (V.name === 'med' && !med()) V = { name: 'home' };
  if (V.name === 'sub' && !sub()) V = med() ? { name: 'med', m: V.m } : { name: 'home' };
  if (V.name === 'item' && !itm()) V = sub() ? { name: 'sub', m: V.m, s: V.s } : { name: 'home' };
  a.innerHTML = V.name === 'home' ? vHome() : V.name === 'med' ? vMed() : V.name === 'sub' ? vSub() : vItem();
  if (V.name === 'item') { updCalc(); paintFields(); loadThumbs(); }
}

function vHome() {
  const ms = [...DB.mediciones].sort((a, b) => b.creado - a.creado);
  return topbar('Péndulo TRRL', false) + '<main>' +
    (ms.length ? ms.map(m => '<div class="card" data-act="open-med" data-id="' + m.id + '"><div class="row"><b>' + esc(m.corto) + '</b>' + badge(medProg(m)) + '</div><div class="sm">' +
      (m.tipo === 'km' ? 'Cada 100 m por km sorteado' : 'Puentes') + (m.periodo ? ' · ' + esc(m.periodo) : '') + ' · ' + m.subtramos.length + ' subtramo(s)</div></div>').join('')
      : '<p class="empty">No hay mediciones. Cree una con el botón inferior.</p>') +
    '</main><footer class="fb"><button class="btn" data-act="new-med">Nueva medición</button>' +
    '<button class="btn sec" data-act="backup-out">Respaldo</button><button class="btn sec" data-act="backup-in">Restaurar</button></footer>';
}
function vMed() {
  const m = med(), isKm = m.tipo === 'km';
  return topbar(m.corto, true, '<button class="ib" data-act="edit-med" aria-label="Editar">Editar</button>') + '<main>' +
    '<div class="sm cap">' + esc(m.titulo) + '</div><div class="sm cap">' + (isKm ? 'Cada 100 m por km sorteado' : 'Puentes') + (m.periodo ? ' · ' + esc(m.periodo) : '') + '</div>' +
    (m.subtramos.length ? m.subtramos.map(s => '<div class="card" data-act="open-sub" data-id="' + s.id + '"><div class="row"><b>ST' + esc(s.numero) + ': ' + esc(s.nombre) + '</b>' + badge(subProg(s)) + '</div><div class="sm">' +
      s.items.length + (isKm ? ' km sorteado(s)' : ' puente(s)') + '</div></div>').join('') : '<p class="empty">Agregue los subtramos' + (isKm ? ' o importe el Excel de sorteo.' : '.') + '</p>') +
    '<button class="btn sec pn" data-act="panel">Panel fotográfico (Word)</button></main><footer class="fb"><button class="btn" data-act="add-sub">Agregar subtramo</button>' +
    (isKm ? '<button class="btn sec" data-act="imp-sorteo">Importar sorteo</button>' : '') +
    '<button class="btn ex" data-act="export">Exportar Excel</button></footer>';
}
function vSub() {
  const m = med(), s = sub(), isKm = m.tipo === 'km';
  return topbar('ST' + s.numero + ': ' + s.nombre, true, '<button class="ib" data-act="edit-sub" aria-label="Editar">Editar</button>') + '<main>' +
    (s.items.length ? s.items.map(it => '<div class="card" data-act="open-item" data-id="' + it.id + '"><div class="row"><b>' +
      (isKm ? 'Km ' + it.km + '+000 a ' + (it.km + 1) + '+000' : esc(it.nombre)) + '</b>' + badge(itemProg(it)) + '</div><div class="sm">' +
      (isKm ? CALZ[it.calzada] : 'Progresiva ' + fmtProg(it.prog)) + ' · Fotos ' + fotoCount(it, isKm) + '/' + (isKm ? 22 : 2) + '</div></div>').join('')
      : '<p class="empty">' + (isKm ? 'Ingrese los km sorteados.' : 'Agregue los puentes.') + '</p>') +
    '</main><footer class="fb"><button class="btn" data-act="add-item">' + (isKm ? 'Agregar km' : 'Agregar puente') + '</button></footer>';
}
function vItem() {
  const m = med(), s = sub(), it = itm(), isKm = m.tipo === 'km', k = Math.min(V.p || 0, it.puntos.length - 1), p = it.puntos[k];
  const lab = j => isKm ? fmtProg(it.km * 1000 + j * 100) : it.puntos[j].u.trim();
  const head = isKm ? 'Km ' + it.km + '+000 · ' + CALZ[it.calzada] : it.nombre + ' · ' + fmtProg(it.prog);
  const inp = (f, v, ph) => '<input data-f="' + f + '" inputmode="decimal" autocomplete="off" enterkeyhint="next" maxlength="6" placeholder="' + ph + '" value="' + esc(v) + '">';
  return topbar(head, true, '<button class="ib" data-act="edit-item" aria-label="Editar">Editar</button>') +
    '<div class="chips">' + it.puntos.map((q, j) => '<button class="chip ' + pState(q) + (j === k ? ' cur' : '') + '" data-act="pt" data-p="' + j + '">' + esc(lab(j)) + '</button>').join('') + '</div><main>' +
    '<div class="ptt">Punto ' + (k + 1) + ' de ' + it.puntos.length + ': <b>' + esc(lab(k)) + '</b></div>' +
    '<section class="grp"><h4>Carril derecho · lecturas</h4><div class="lec">' + p.d.map((v, j) => inp('d' + j, v, 'L' + (j + 1))).join('') + '</div></section>' +
    '<section class="grp"><h4>Carril izquierdo · lecturas</h4><div class="lec">' + p.i.map((v, j) => inp('i' + j, v, 'L' + (j + 1))).join('') + '</div></section>' +
    '<section class="grp"><h4>Temperatura (°C)</h4><div class="tmp"><label>Ambiente' + inp('ta', p.ta, '0.0') + '</label><label>Agua' + inp('tw', p.tw, '0.0') + '</label></div></section>' +
    '<section class="calc"><div><span>BPN</span><b id="c-q">—</b></div><div><span>FA(20)</span><b id="c-w">—</b></div><div><span>BPNA</span><b id="c-r">—</b></div><div><span>CRD</span><b id="c-s">—</b></div></section>' +
    fotosHtml(it, p, isKm, lab(k)) +
    '</main><footer class="fb"><button class="btn sec" data-act="prev"' + (k === 0 ? ' disabled' : '') + '>Anterior</button><button class="btn" data-act="next"' + (k === it.puntos.length - 1 ? ' disabled' : '') + '>Siguiente</button></footer>';
}
function updCalc() {
  const it = itm(); if (!it) return; const p = it.puntos[Math.min(V.p || 0, it.puntos.length - 1)]; const c = calcPunto(p);
  $('#c-q').textContent = fix(c.q, 1); $('#c-w').textContent = c.w === null ? '—' : c.w.toFixed(3);
  $('#c-r').textContent = fix(c.r, 1); const s = $('#c-s'); s.textContent = fix(c.s, 2);
  s.classList.toggle('low', c.s !== null && c.s < 0.4);
  const chip = document.querySelector('.chip.cur'); if (chip) chip.className = 'chip cur ' + pState(p);
}

/* ---------- Captura de lecturas ---------- */
const app = $('#app');
app.addEventListener('input', e => {
  const t = e.target; const f = t.dataset && t.dataset.f; if (!f) return;
  let v = t.value.replace(',', '.').replace(/[^0-9.]/g, ''); const i = v.indexOf('.'); if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
  if (v !== t.value) t.value = v;
  const it = itm(), p = it.puntos[V.p || 0];
  if (f === 'ta' || f === 'tw') p[f] = v; else p[f[0]][Number(f[1])] = v;
  if (p.cf && p.cf.length) p.cf = p.cf.filter(k => k !== f);
  save(); updCalc(); paintFields();
  const isT = f === 'ta' || f === 'tw';
  if (!isT && v.replace('.', '').length >= 2 && outRange(f, v)) warnRange(f, v);
  if (isT && numOf(v) !== null && numOf(v) > RT[1]) warnRange(f, v);
  if (!isT && ((/^\d{2}$/.test(v) && v[0] !== '1') || /^\d{3}$/.test(v))) focusNext(t);
});
app.addEventListener('change', e => { const t = e.target; const f = t.dataset && t.dataset.f; if (f && t.value !== '' && outRange(f, t.value)) warnRange(f, t.value); });
let _lw = '';
function warnRange(f, v) { const key = f + '|' + v; if (key === _lw) return; _lw = key; const r = rngOf(f); toast(FLAB(f) + ': ' + v + ' está fuera de ' + r[0] + '–' + r[1] + '. Revise el tipeo.'); }
app.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !(e.target.dataset && e.target.dataset.f)) return;
  e.preventDefault(); const all = [...app.querySelectorAll('input[data-f]')];
  if (e.target === all[all.length - 1]) stepPoint(1); else focusNext(e.target);
});
function focusNext(el) { const all = [...app.querySelectorAll('input[data-f]')]; const i = all.indexOf(el); if (i >= 0 && i < all.length - 1) { all[i + 1].focus(); all[i + 1].select && all[i + 1].select(); } }
/* Marca en rojo lo fuera de rango (sin confirmar) y lo que falta tras un intento de avance */
function paintFields() {
  const it = itm(); if (!it) return; const p = it.puntos[Math.min(V.p || 0, it.puntos.length - 1)]; const cf = p.cf || [];
  app.querySelectorAll('input[data-f]').forEach(inp => {
    const f = inp.dataset.f, v = inp.value, isT = f === 'ta' || f === 'tw';
    inp.classList.toggle('bad', v !== '' && (isT || v.replace('.', '').length >= 2) && outRange(f, v) && !cf.includes(f));
    inp.classList.toggle('miss', !!V.showMiss && v === '');
  });
}
/* Verifica el punto antes de avanzar. Devuelve true si se puede continuar. */
function checkPoint(p) {
  return new Promise(res => {
    const q = pIssues(p);
    if (q.miss.length) {
      V.showMiss = true; paintFields();
      modal({ title: 'Faltan datos', ok: 'Entendido', cancel: false, focus: false,
        body: '<p>Complete todos los datos de este punto antes de continuar.</p><p class="sm">Faltan: ' + q.miss.map(FLAB).join('; ') + '.</p>',
        onOk: () => { const f = app.querySelector('input.miss'); if (f) f.focus(); res(false); } });
      return;
    }
    if (q.bad.length) {
      paintFields();
      modal({ title: 'Valores fuera de rango', ok: 'Es correcto, continuar', cancelText: 'Corregir', focus: false,
        body: '<p>Revise el tipeo. Rango admitido: lecturas ' + RL[0] + '–' + RL[1] + ', temperatura ' + RT[0] + '–' + RT[1] + ' °C.</p><ul>' + q.bad.map(k => '<li>' + FLAB(k) + ': <b>' + esc(valOf(p, k)) + '</b></li>').join('') + '</ul>',
        onOk: () => { p.cf = (p.cf || []).concat(q.bad); saveNow(); res(true); } });
      $('#modal [data-mc]').addEventListener('click', () => { const f = app.querySelector('input.bad'); if (f) f.focus(); res(false); });
      return;
    }
    res(true);
  });
}
async function gotoPoint(j) {
  const it = itm(); const cur = V.p || 0; if (j === cur) return;
  if (j > cur) {
    for (let x = cur; x < j; x++) {
      if (pState(it.puntos[x]) === 'c') continue;
      if (x === cur) { if (!(await checkPoint(it.puntos[x]))) return; if (pState(it.puntos[x]) === 'c') continue; }
      toast('Complete primero el punto anterior.'); return;
    }
  }
  saveNow(); V = Object.assign({}, V, { p: j, showMiss: false }); history.replaceState({ v: V }, ''); render(); window.scrollTo(0, 0);
  if (j > cur) { const first = app.querySelector('input[data-f]'); if (first) first.focus(); }
}
function stepPoint(d) { const it = itm(); const n = Math.max(0, Math.min(it.puntos.length - 1, (V.p || 0) + d)); return gotoPoint(n); }

/* ---------- Acciones ---------- */
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, id = b.dataset.id;
  const A = {
    back: () => history.back(),
    'new-med': () => formMed(null),
    'open-med': () => go({ name: 'med', m: id }),
    'edit-med': () => formMed(med()),
    'add-sub': () => formSub(null),
    'open-sub': () => go({ name: 'sub', m: V.m, s: id }),
    'edit-sub': () => formSub(sub()),
    'add-item': () => (med().tipo === 'km' ? formKm(null) : formPuente(null)),
    'open-item': () => go({ name: 'item', m: V.m, s: V.s, i: id, p: firstOpen(sub().items.find(x => x.id === id)) }),
    'edit-item': () => (med().tipo === 'km' ? formKm(itm()) : formPuente(itm())),
    pt: () => gotoPoint(Number(b.dataset.p)),
    foto: () => fotoSlot(Number(b.dataset.n)),
    panel: () => panelDialog(),
    prev: () => stepPoint(-1), next: () => stepPoint(1),
    export: () => doExport(med()),
    'imp-sorteo': () => $('#fsorteo').click(),
    'backup-out': () => backupOut(), 'backup-in': () => $('#fbackup').click()
  };
  if (A[act]) A[act]();
});
function firstOpen(it) { const j = it.puntos.findIndex(p => pState(p) !== 'c'); return j < 0 ? 0 : j; }

/* ---------- Formularios ---------- */
function formMed(m) {
  const isNew = !m;
  const ci = m ? CATALOGO.findIndex(c => c.corto === m.corto) : -1;
  const sel = m ? (ci >= 0 ? String(ci) : 'otros') : '';
  const hoy = new Date(), per = MESES[hoy.getMonth()] + ' ' + String(hoy.getFullYear()).slice(2);
  modal({
    title: isNew ? 'Nueva medición' : 'Editar medición',
    body:
      '<label>Concesión</label><select name="conc" id="sc" required>' + (isNew ? '<option value="">— elegir —</option>' : '') +
      CATALOGO.map((c, i) => '<option value="' + i + '"' + (sel === String(i) ? ' selected' : '') + '>' + esc(c.corto) + '</option>').join('') +
      '<option value="otros"' + (sel === 'otros' ? ' selected' : '') + '>Otros</option></select>' +
      '<div id="inf" class="sm" style="margin-top:6px"></div>' +
      '<div id="ot">' +
      (isNew ? '<label>Tipo de ensayo</label><div class="seg"><label><input type="radio" name="tipo" value="puentes" checked><span>Puentes</span></label><label><input type="radio" name="tipo" value="km"><span>Cada 100 m por km</span></label></div>' : '') +
      '<label>Título de la concesión (fila 3 del Excel)</label><textarea name="titulo" rows="3">' + esc(m && ci < 0 ? m.titulo : '') + '</textarea>' +
      '<label>Nombre corto (nombre de hoja y de archivo)</label><input name="corto" maxlength="31" value="' + esc(m && ci < 0 ? m.corto : '') + '"></div>' +
      '<label>Periodo (para el nombre de archivo)</label><input name="periodo" placeholder="Nov 26" value="' + esc(m ? m.periodo : per) + '">',
    ok: 'Guardar',
    init: root => {
      const sc = root.querySelector('#sc'), ot = root.querySelector('#ot'), inf = root.querySelector('#inf');
      const upd = () => {
        const o = sc.value === 'otros'; ot.style.display = o ? '' : 'none';
        ot.querySelectorAll('input,textarea').forEach(x => { x.disabled = !o; });
        const c = CATALOGO[Number(sc.value)];
        inf.textContent = (!o && c) ? (c.tipo === 'km' ? 'Ensayo cada 100 m por km sorteado.' : 'Ensayo por puentes.') + ' ' + c.titulo : '';
      };
      sc.onchange = upd; upd();
    },
    onOk: fd => {
      const conc = fd.get('conc'), periodo = fd.get('periodo').trim(); let titulo, corto, tipo;
      if (conc === '') { toast('Elija la concesión.'); return false; }
      if (conc === 'otros') {
        titulo = (fd.get('titulo') || '').trim(); corto = (fd.get('corto') || '').trim(); tipo = isNew ? fd.get('tipo') : m.tipo;
        if (!titulo || !corto) { toast('Para "Otros" escriba el título y el nombre corto.'); return false; }
      } else { const c = CATALOGO[Number(conc)]; titulo = c.titulo; corto = c.corto; tipo = c.tipo; if (!isNew && m.tipo !== tipo) { toast('No se puede cambiar el tipo de ensayo de una medición ya creada.'); return false; } }
      if (isNew) { const nm = { id: uid(), tipo, titulo, corto, periodo, creado: Date.now(), subtramos: [] }; DB.mediciones.push(nm); saveNow(); go({ name: 'med', m: nm.id }); }
      else { Object.assign(m, { titulo, corto, periodo }); saveNow(); render(); }
    }
  });
  if (!isNew) {
    const mb = $('#modal .mbtn'); const d = document.createElement('button'); d.type = 'button'; d.className = 'btn dg'; d.textContent = 'Eliminar medición';
    d.onclick = async () => { $('#modal').classList.remove('on'); const ok = await confirmBox('Eliminar medición', 'Se eliminará la medición con todas sus lecturas y fotos. Esta acción no se puede deshacer.', 'Eliminar'); if (ok) { borrarFotosDe(m); DB.mediciones = DB.mediciones.filter(x => x.id !== m.id); saveNow(); redo({ name: 'home' }); } else formMed(m); };
    mb.insertBefore(d, mb.firstChild);
  }
}
function formSub(s) {
  const m = med(), nextN = s ? s.numero : (m.subtramos.length ? Math.max(...m.subtramos.map(x => Number(x.numero) || 0)) + 1 : 1);
  modal({
    title: s ? 'Editar subtramo' : 'Nuevo subtramo',
    body: (s ? '' : subCatalogoHtml(m)) + '<label>Número de subtramo</label><input name="numero" type="number" inputmode="numeric" min="1" required value="' + esc(nextN) + '"><label>Nombre (por ejemplo: Chota - Hualgayoc)</label><input name="nombre" required value="' + esc(s ? s.nombre : '') + '">',
    ok: 'Guardar',
    init: root => { const sc = root.querySelector('#scat'); if (sc) sc.onchange = () => { const c = subCat(m)[Number(sc.value)]; if (c) { root.querySelector('[name=numero]').value = c[0]; root.querySelector('[name=nombre]').value = c[1]; } }; },
    onOk: fd => {
      const numero = Number(fd.get('numero')), nombre = fd.get('nombre').trim(); if (!numero || !nombre) return false;
      if (s) { Object.assign(s, { numero, nombre }); } else m.subtramos.push({ id: uid(), numero, nombre, items: [] });
      saveNow(); render();
    }
  });
  if (s) {
    const d = document.createElement('button'); d.type = 'button'; d.className = 'btn dg'; d.textContent = 'Eliminar subtramo';
    d.onclick = async () => { $('#modal').classList.remove('on'); const ok = await confirmBox('Eliminar subtramo', 'Se eliminará el subtramo con todas sus lecturas y fotos.', 'Eliminar'); if (ok) { borrarFotosDe(s); m.subtramos = m.subtramos.filter(x => x.id !== s.id); saveNow(); history.back(); } else formSub(s); };
    $('#modal .mbtn').insertBefore(d, $('#modal .mbtn').firstChild);
  }
}
function subCat(m) { const c = CATALOGO.find(x => x.corto === m.corto); return c ? c.sub.filter(x => !m.subtramos.some(s => Number(s.numero) === x[0])) : []; }
function subCatalogoHtml(m) {
  const l = subCat(m); if (!l.length) return '';
  return '<label>Subtramo de la concesión</label><select id="scat"><option value="">— elegir (o escribir abajo otro) —</option>' + l.map((x, i) => '<option value="' + i + '">ST' + x[0] + ': ' + esc(x[1]) + '</option>').join('') + '</select>';
}
function formPuente(it) {
  const s = sub();
  modal({
    title: it ? 'Editar puente' : 'Nuevo puente',
    body: '<label>Nombre del puente</label><input name="nombre" required placeholder="Puente Hualgayoc" value="' + esc(it ? it.nombre : '') + '">' +
      '<label>Progresiva del puente (km + m)</label><div class="two"><input name="km" type="number" inputmode="numeric" min="0" required placeholder="km" value="' + (it ? Math.floor(it.prog / 1000) : '') + '"><input name="m" type="number" inputmode="numeric" min="0" max="999" required placeholder="m" value="' + (it ? it.prog % 1000 : '') + '"></div>',
    ok: 'Guardar',
    onOk: fd => {
      const nombre = fd.get('nombre').trim(), km = Number(fd.get('km')), mm = Number(fd.get('m')); if (!nombre || fd.get('km') === '' || fd.get('m') === '' || mm > 999) return false;
      const prog = km * 1000 + mm; if (it) Object.assign(it, { nombre, prog }); else s.items.push(newPuente(nombre, prog));
      saveNow(); render();
    }
  });
  if (it) addDelItem(it);
}
function formKm(it) {
  const s = sub();
  modal({
    title: it ? 'Editar km sorteado' : 'Km sorteados',
    body: (it ? '<label>Km</label><input name="kms" type="number" inputmode="numeric" min="0" required value="' + it.km + '">'
      : '<label>Km sorteados (separados por espacio o coma)</label><textarea name="kms" rows="3" inputmode="numeric" required placeholder="42 58 59 88"></textarea>') +
      '<label>Calzada</label><select name="calz">' + Object.keys(CALZ).map(k => '<option value="' + k + '"' + (it && it.calzada === k ? ' selected' : '') + '>' + CALZ[k] + '</option>').join('') + '</select>',
    ok: 'Guardar',
    onOk: fd => {
      const calz = fd.get('calz'); const nums = String(fd.get('kms')).split(/[\s,;]+/).filter(Boolean).map(Number);
      if (!nums.length || nums.some(n => !Number.isInteger(n) || n < 0)) { toast('Ingrese solo números enteros de km.'); return false; }
      if (it) { if (s.items.some(x => x !== it && x.km === nums[0] && x.calzada === calz)) { toast('Ese km ya existe con esa calzada.'); return false; } Object.assign(it, { km: nums[0], calzada: calz }); }
      else { let dup = 0; nums.forEach(n => { if (s.items.some(x => x.km === n && x.calzada === calz)) dup++; else s.items.push(newKm(n, calz)); }); if (dup) toast(dup + ' km ya existían y no se repitieron.'); }
      s.items.sort((a, b) => a.km - b.km || a.calzada.localeCompare(b.calzada)); saveNow(); render();
    }
  });
  if (it) addDelItem(it);
}
function addDelItem(it) {
  const d = document.createElement('button'); d.type = 'button'; d.className = 'btn dg'; d.textContent = 'Eliminar';
  d.onclick = async () => { $('#modal').classList.remove('on'); const ok = await confirmBox('Eliminar', 'Se eliminará con todas sus lecturas y fotos.', 'Eliminar'); if (ok) { const s = sub(); borrarFotosDe(it); s.items = s.items.filter(x => x.id !== it.id); saveNow(); history.back(); } else (med().tipo === 'km' ? formKm(it) : formPuente(it)); };
  $('#modal .mbtn').insertBefore(d, $('#modal .mbtn').firstChild);
}

/* ---------- Importar Excel de sorteo ---------- */
$('#fsorteo').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    const pack = await sorteoSheets(await f.arrayBuffer());
    if (!pack.sheets.length) throw new Error('El archivo no tiene hojas.');
    const pick = pack.sheets.length === 1 ? Promise.resolve(pack.sheets[0]) : new Promise(res => {
      modal({
        title: 'Elegir hoja del sorteo', ok: 'Continuar',
        body: pack.sheets.map((s, i) => '<label class="rd"><input type="radio" name="h" value="' + i + '"' + (i === pack.sheets.length - 1 ? ' checked' : '') + '><span>' + esc(s.name) + '</span></label>').join(''),
        onOk: fd => res(pack.sheets[Number(fd.get('h'))])
      });
    });
    const sheet = await pick; const lista = await sorteoParse(pack, sheet);
    if (!lista.length) throw new Error('No se encontraron km sorteados en la hoja "' + sheet.name + '".');
    modal({
      title: 'Sorteo leído: ' + sheet.name, ok: 'Agregar a la medición',
      body: '<p class="sm">Se agregarán estos subtramos y km (calzada única). Lo ya cargado no se modifica.</p>' + lista.map((s, i) => '<div class="pv"><b>ST' + (i + 1) + ': ' + esc(s.nombre) + '</b><div class="sm">' + s.kms.length + ' km: ' + s.kms.join(', ') + '</div></div>').join(''),
      focus: false,
      onOk: () => importar(lista)
    });
  } catch (e) { alertBox('No se pudo leer el sorteo', esc(e.message || e)); }
});
function importar(lista) {
  const m = med(); const norm = t => String(t).toLowerCase().replace(/\s+/g, ' ').trim(); let nS = 0, nK = 0;
  lista.forEach((sg, idx) => {
    let s = m.subtramos.find(x => norm(x.nombre) === norm(sg.nombre));
    if (!s) { s = { id: uid(), numero: idx + 1, nombre: sg.nombre, items: [] }; m.subtramos.push(s); nS++; }
    sg.kms.forEach(k => { if (!s.items.some(x => x.km === k && x.calzada === 'UNICA')) { s.items.push(newKm(k, 'UNICA')); nK++; } });
    s.items.sort((a, b) => a.km - b.km || a.calzada.localeCompare(b.calzada));
  });
  m.subtramos.sort((a, b) => a.numero - b.numero);
  saveNow(); render(); toast(nS + ' subtramo(s) y ' + nK + ' km agregados.');
}

/* ---------- Exportar Excel ---------- */
function fileName(m) { return ('Pendulo TRRL. ' + m.corto + (m.periodo ? '. ' + m.periodo : '') + '.xlsx').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\\/:*?"<>|]/g, '-'); }
function nativeCall(p, m, o) { const cap = window.Capacitor; const pl = cap.Plugins && cap.Plugins[p]; return (pl && pl[m]) ? pl[m](o) : cap.nativePromise(p, m, o); }
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
async function deliverFile(name, u8, mime) {
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    const call = nativeCall;
    const data = u8ToB64(u8);
    let saved = '';
    try { await call('Filesystem', 'writeFile', { path: 'Pendulo/' + name, data, directory: 'DOCUMENTS', recursive: true }); saved = 'Guardado en Documentos/Pendulo. '; } catch (e) { }
    const w = await call('Filesystem', 'writeFile', { path: name, data, directory: 'CACHE' });
    await call('Share', 'share', { title: name, files: [w.uri], dialogTitle: 'Guardar o enviar el Excel' });
    return saved;
  }
  const url = URL.createObjectURL(new Blob([u8], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 5000); return '';
}
async function doExport(m) {
  if (!m.subtramos.length) { toast('Agregue al menos un subtramo.'); return; }
  const empty = m.subtramos.filter(s => !s.items.length).map(s => 'ST' + s.numero);
  const pr = medProg(m); const inc = pr.t - pr.c; const st = medStats(m);
  const go2 = async () => {
    try { toast('Generando Excel…'); const bytes = await exportXlsx(m); const r = await deliverFile(fileName(m), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); toast(r + 'Excel generado.'); }
    catch (e) { alertBox('No se pudo exportar', esc(e.message || e)); }
  };
  if (inc > 0 || empty.length) {
    modal({ title: 'Exportar Excel', ok: 'Exportar de todos modos', focus: false, onOk: go2,
      body: '<p>' + (inc > 0 ? 'Hay ' + inc + ' punto(s) incompletos o con valores fuera de rango sin confirmar' + (st.w ? ' (' + st.w + ' fuera de rango)' : '') + '; se exportan tal como están, con celdas vacías donde falte el dato.' : '') + (empty.length ? ' Subtramos sin ' + (m.tipo === 'km' ? 'km' : 'puentes') + ': ' + empty.join(', ') + '.' : '') + '</p>' });
  } else go2();
}

/* ---------- Respaldo ---------- */
async function backupOut() {
  const d = new Date(); const nm = 'Respaldo Pendulo ' + d.toISOString().slice(0, 10) + '.json';
  try { const r = await deliverFile(nm, new TextEncoder().encode(JSON.stringify(DB)), 'application/json'); toast(r + 'Respaldo generado.'); } catch (e) { alertBox('No se pudo generar el respaldo', esc(e.message || e)); }
}
$('#fbackup').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (!d || !Array.isArray(d.mediciones)) throw new Error('El archivo no es un respaldo de esta aplicación.');
    const ok = await confirmBox('Restaurar respaldo', 'Se reemplazarán TODAS las mediciones actuales de este teléfono por las del respaldo (' + d.mediciones.length + ' medición/es).', 'Restaurar');
    if (ok) { DB = d; DB.concesiones = DB.concesiones || []; saveNow(); redo({ name: 'home' }); toast('Respaldo restaurado.'); }
  } catch (e) { alertBox('No se pudo restaurar', esc(e.message || e)); }
});

/* ---------- Fotos (IndexedDB) ---------- */
let _idb = null;
function idb() {
  return new Promise((res, rej) => {
    if (_idb) return res(_idb);
    const r = indexedDB.open('pendulo_fotos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('f');
    r.onsuccess = () => { _idb = r.result; res(_idb); };
    r.onerror = () => rej(r.error);
  });
}
async function fotoPut(id, blob) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function fotoGet(id) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('f').objectStore('f').get(id); t.onsuccess = () => res(t.result || null); t.onerror = () => rej(t.error); }); }
async function fotoDel(id) { try { const d = await idb(); if (_urls[id]) { URL.revokeObjectURL(_urls[id]); delete _urls[id]; } return new Promise(res => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').delete(id); t.oncomplete = res; t.onerror = res; }); } catch (e) { } }
const _urls = {};
async function fotoURL(id) { if (_urls[id]) return _urls[id]; const b = await fotoGet(id); if (!b) return ''; return (_urls[id] = URL.createObjectURL(b)); }
function loadThumbs(root) { (root || document).querySelectorAll('img[data-foto]').forEach(async im => { if (im.getAttribute('src')) return; const u = await fotoURL(im.dataset.foto); if (u) im.src = u; }); }
/* recorre todas las fotos de una medición, subtramo o ítem */
function walkFotos(o, fn) {
  const items = o.items ? o.items : o.subtramos ? o.subtramos.flatMap(s => s.items) : [o];
  items.forEach(it => { (it.fotos || []).forEach(f => f && fn(f)); (it.puntos || []).forEach(p => (p.fotos || []).forEach(f => f && fn(f))); });
}
function borrarFotosDe(o) { walkFotos(o, f => fotoDel(f.id)); }
function fotoCount(it, isKm) { let n = 0; walkFotos(it, () => n++); return n; }

const pad2 = n => String(n).padStart(2, '0');
function fmtFecha(iso) { const d = new Date(iso); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function holder() { const it = itm(); if (!it) return null; const h = med().tipo === 'km' ? it.puntos[V.p || 0] : it; if (!h.fotos) h.fotos = [null, null]; return h; }

function fotosHtml(it, p, isKm, lab) {
  const h = isKm ? p : it; const f = h.fotos || [null, null];
  const slot = n => f[n]
    ? '<button type="button" class="slot on" data-act="foto" data-n="' + n + '"><img data-foto="' + f[n].id + '" alt="Foto ' + (n + 1) + '"><span>' + fmtFecha(f[n].fecha) + '</span></button>'
    : '<button type="button" class="slot" data-act="foto" data-n="' + n + '"><b>Tomar foto ' + (n + 1) + '</b></button>';
  return '<section class="grp"><h4>' + (isKm ? 'Fotos del punto ' + esc(lab) : 'Fotos del puente') + ' (2)</h4><div class="fotos">' + slot(0) + slot(1) + '</div></section>';
}

/* Cámara: plugin nativo en el APK; en navegador, selector de archivo con cámara */
async function tomarFoto() {
  if (isNative()) {
    try {
      const r = await nativeCall('Camera', 'getPhoto', { quality: 85, resultType: 'dataUrl', source: 'CAMERA', correctOrientation: true, saveToGallery: false });
      return await (await fetch(r.dataUrl)).blob();
    } catch (e) { if (/cancel/i.test(String(e && (e.message || e)))) return null; throw e; }
  }
  return new Promise(res => { const f = $('#ffoto'); f.value = ''; f.onchange = () => res(f.files[0] || null); f.oncancel = () => res(null); f.click(); });
}
async function procesarFoto(blob) {
  let bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('No se pudo leer la imagen.')); im.src = URL.createObjectURL(blob); }); }
  const sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
  const sc = Math.min(1, 1280 / Math.max(sw, sh)), w = Math.round(sw * sc), h = Math.round(sh * sc);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, w, h);
  const now = new Date(), txt = fmtFecha(now.toISOString());
  const fs = Math.max(14, Math.round(Math.min(w, h) * 0.045)); x.font = 'bold ' + fs + 'px Arial, sans-serif';
  const tw = x.measureText(txt).width, pd = Math.round(fs * 0.4);
  x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(w - tw - pd * 2, h - fs - pd * 2, tw + pd * 2, fs + pd * 2);
  x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(txt, w - tw - pd, h - fs / 2 - pd);
  const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.75));
  return { blob: out, w, h, fecha: now.toISOString() };
}
async function capturar(n) {
  const h = holder();
  try {
    const raw = await tomarFoto(); if (!raw) return;
    toast('Procesando foto…');
    const r = await procesarFoto(raw); const id = uid(); const old = h.fotos[n];
    await fotoPut(id, r.blob); h.fotos[n] = { id, fecha: r.fecha, w: r.w, h: r.h };
    if (old) fotoDel(old.id);
    saveNow(); if (V.name === 'item') render(); toast('Foto ' + (n + 1) + ' guardada (' + fmtFecha(r.fecha) + ').');
  } catch (e) { alertBox('No se pudo tomar la foto', esc(e.message || e)); }
}
function fotoSlot(n) {
  const h = holder(); const f = h.fotos[n];
  if (!f) { capturar(n); return; }
  modal({
    title: 'Foto ' + (n + 1) + ' · ' + fmtFecha(f.fecha), ok: 'Retomar', cancelText: 'Cerrar', focus: false,
    body: '<img class="big" data-foto="' + f.id + '" alt="Foto ' + (n + 1) + '">',
    onOk: () => { capturar(n); },
    init: root => { loadThumbs(root); }
  });
  const d = document.createElement('button'); d.type = 'button'; d.className = 'btn dg'; d.textContent = 'Eliminar foto';
  d.onclick = () => { fotoDel(f.id); h.fotos[n] = null; saveNow(); $('#modal').classList.remove('on'); $('#modal').innerHTML = ''; render(); };
  $('#modal .mbtn').insertBefore(d, $('#modal .mbtn').firstChild);
}

/* ---------- Panel fotográfico (Word) ---------- */
function panelDialog() {
  const m = med(); let tot = 0; walkFotos(m, () => tot++);
  if (!tot) { alertBox('Panel fotográfico', 'Aún no hay fotos en esta medición.'); return; }
  const cnt = o => { let n = 0; walkFotos(o, () => n++); return n; };
  modal({
    title: 'Panel fotográfico (Word)', ok: 'Generar',
    body: '<label class="rd"><input type="radio" name="alc" value="all" checked><span>Toda la medición (' + tot + ' fotos)</span></label>' +
      m.subtramos.map(s => '<label class="rd"><input type="radio" name="alc" value="' + s.id + '"><span>ST' + esc(s.numero) + ': ' + esc(s.nombre) + ' (' + cnt(s) + ' fotos)</span></label>').join(''),
    focus: false,
    onOk: async fd => {
      const alc = fd.get('alc');
      try { toast('Generando panel…'); const r = await buildPanelDocx(m, alc); const r2 = await deliverFile(r.name, r.bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); toast(r2 + 'Panel generado.'); }
      catch (e) { alertBox('No se pudo generar el panel', esc(e.message || e)); }
    }
  });
}

render();
