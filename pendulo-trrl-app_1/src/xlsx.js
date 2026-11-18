/* ============================================================
   xlsx.js — ZIP + XLSX sin dependencias (exportar modelo y leer sorteo)
   ============================================================ */
'use strict';
const _enc = new TextEncoder(), _dec = new TextDecoder();

/* ---------- utilidades binarias ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function b64ToU8(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function u8ToB64(u8) { let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
function concatU8(list) { let n = 0; for (const a of list) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of list) { o.set(a, p); p += a.length; } return o; }
async function _pipe(u8, T) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(T)).arrayBuffer()); }
async function deflateRaw(u8) { if (typeof CompressionStream === 'undefined') return null; try { return await _pipe(u8, new CompressionStream('deflate-raw')); } catch (e) { return null; } }
async function inflateRaw(u8) { return _pipe(u8, new DecompressionStream('deflate-raw')); }

/* ---------- ZIP: escritura ---------- */
async function makeZip(files) {
  const parts = [], central = []; let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const nameB = _enc.encode(f.name); const crc = crc32(f.data);
    let comp = f.store ? null : await deflateRaw(f.data), method = 8;
    if (!comp || comp.length >= f.data.length) { comp = f.data; method = 0; }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, comp.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(lh.buffer), nameB, comp);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, comp.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, nameB.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return concatU8([...parts, ...central, new Uint8Array(end.buffer)]);
}

/* ---------- ZIP: lectura ---------- */
async function readZip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const ent = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true),
      xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    ent[_dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, lho };
    p += 46 + nl + xl + cl;
  }
  return {
    names: Object.keys(ent),
    async text(name) {
      const m = ent[name]; if (!m) return null;
      const nl = dv.getUint16(m.lho + 26, true), xl = dv.getUint16(m.lho + 28, true), s = m.lho + 30 + nl + xl;
      const raw = u8.subarray(s, s + m.csize);
      return _dec.decode(m.method === 0 ? raw : await inflateRaw(raw));
    }
  };
}

/* ---------- Cálculo (idéntico al modelo) ---------- */
function numOf(v) { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
function xlRound(x, n) { return Number(Math.round(Number(x + 'e' + n)) + 'e-' + n); }
function calcPunto(p) {
  const vals = [...p.d, ...p.i].map(numOf).filter(v => v !== null);
  const q = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const tw = numOf(p.tw);
  const w = tw === null ? null : 1 / (1 - 0.00525 * (tw - 20));
  const r = (q === null || w === null) ? null : xlRound(q * w, 1);
  const s = r === null ? null : xlRound(r / 100, 2);
  return { q, w, r, s, n: vals.length };
}

/* ---------- Constructor de hojas ---------- */
function colNum(L) { let n = 0; for (const ch of L) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function xesc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

class SST {
  constructor() { this.map = new Map(); this.list = []; this.count = 0; }
  idx(s) { this.count++; if (!this.map.has(s)) { this.map.set(s, this.list.length); this.list.push(s); } return this.map.get(s); }
  xml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + this.count + '" uniqueCount="' + this.list.length + '">' +
      this.list.map(s => '<si><t xml:space="preserve">' + xesc(s) + '</t></si>').join('') + '</sst>';
  }
}

class Sheet {
  constructor(sst) { this.sst = sst; this.rows = new Map(); this.merges = []; }
  row(r, attrs) { if (!this.rows.has(r)) this.rows.set(r, { attrs: attrs || '', cells: new Map() }); else if (attrs) this.rows.get(r).attrs = attrs; return this.rows.get(r); }
  /* v: número | texto | null ; f: fórmula ; fv: valor en caché de la fórmula */
  set(r, col, s, v, f, fv) {
    const row = this.row(r);
    let x = '<c r="' + col + r + '" s="' + s + '"';
    if (f !== undefined) {
      const isStr = typeof fv === 'string';
      x += (isStr ? ' t="str"' : '') + '><f>' + xesc(f) + '</f>' + (fv === null || fv === undefined ? '' : '<v>' + xesc(fv) + '</v>') + '</c>';
    } else if (v === null || v === undefined || v === '') x += '/>';
    else if (typeof v === 'number') x += '><v>' + v + '</v></c>';
    else x += ' t="s"><v>' + this.sst.idx(String(v)) + '</v></c>';
    row.cells.set(colNum(col), x);
  }
  merge(ref) { this.merges.push(ref); }
  dataXml() {
    const rs = [...this.rows.keys()].sort((a, b) => a - b);
    return '<sheetData>' + rs.map(r => {
      const row = this.rows.get(r);
      const cs = [...row.cells.keys()].sort((a, b) => a - b).map(k => row.cells.get(k)).join('');
      return '<row r="' + r + '"' + (row.attrs ? ' ' + row.attrs : '') + '>' + cs + '</row>';
    }).join('') + '</sheetData>';
  }
}

/* ---------- Estilos por posición (índices tomados de los modelos originales) ---------- */
const KM = {
  title: { G: 12, H: 12, I: 12, J: 12, K: 12, L: 12, M: 12, N: 12, O: 12, P: 12 },
  hdr1: { D: 19, E: 20, F: 21, G: 11, H: 11, I: 11, J: 11, K: 11, L: 11, M: 11, N: 11, O: 11, P: 11, Q: 10, R: 10, S: 10, T: 22, U: 11, V: 11, W: 9 },
  hdr2: { B: 8, C: 8, D: 23, E: 23, F: 24, G: 23, H: 23, I: 23, J: 23, K: 23, L: 23, M: 23, N: 23, O: 23, P: 23, Q: 10, R: 10, S: 10, T: 25, U: 23, V: 26, W: 9, X: 27 },
  d0: { A: 15, B: 28, C: 29, D: 30, E: 30, F: 31, G: 32, H: 33, I: 33, J: 33, K: 34, L: 35, M: 36, N: 36, O: 36, P: 36, Q: 37, R: 38, S: 39, T: 40, U: 41, V: 42, W: 43 },
  dN: { B: 28, C: 29, D: 30, E: 30, F: 31, G: 44, H: 36, I: 36, J: 36, K: 45, L: 35, M: 36, N: 36, O: 36, P: 36, Q: 37, R: 38, S: 39, T: 40, U: 46, V: 47, W: 43 },
  blank: { B: 28, C: 49, D: 50, E: 30, F: 31, G: 44, H: 36, I: 36, J: 36, K: 45, L: 35, M: 36, N: 36, O: 36, P: 36, Q: 37, R: 38, S: 39, T: 40, U: 46, V: 47, W: 43 },
  h1: { D: 14, rest: 14 }, h2: { D: 13 }, h3: { D: 13 }
};
const PU = {
  title: { G: 30, H: 31, I: 31, J: 31, K: 31, L: 31, M: 31, N: 31, O: 31, P: 32 },
  hdr1: { D: 5, E: 6, F: 7, G: 33, H: 31, I: 31, J: 31, K: 32, L: 33, M: 31, N: 31, O: 31, P: 32, Q: 37, R: 37, S: 37, T: 8, U: 33, V: 32, W: 28 },
  hdr2: { C: 9, D: 10, E: 10, F: 11, G: 10, H: 10, I: 10, J: 10, K: 10, L: 10, M: 10, N: 10, O: 10, P: 10, Q: 29, R: 29, S: 29, T: 12, U: 10, V: 13, W: 29, X: 14 },
  d0: { A: 1, B: 15, C: 25, D: 16, E: 16, G: 27, H: 27, I: 27, J: 27, K: 27, L: 27, M: 27, N: 27, O: 27, P: 27, Q: 26, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22 },
  dN: { B: 15, C: 23, D: 16, E: 16, G: 27, H: 27, I: 27, J: 27, K: 27, L: 27, M: 27, N: 27, O: 27, P: 27, Q: 26, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22 }
};
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const C5_D = ['G', 'H', 'I', 'J', 'K'], C5_I = ['L', 'M', 'N', 'O', 'P'];

/* Cabecera de subtramo (3 filas: título, concesión, subtramo) */
function headerKm(sh, h, med, st) {
  sh.row(h, 'ht="18" customHeight="1"'); sh.row(h + 1, 'ht="15" customHeight="1"'); sh.row(h + 2, 'ht="15" customHeight="1"');
  for (let c = 4; c <= 22; c++) { const L = c > 26 ? '' : LET[c - 1]; sh.set(h, L, 14, c === 4 ? 'LECTURA DE LA FRICCIÓN CON PÉNDULO TRRL' : null); sh.set(h + 1, L, 13, c === 4 ? med.titulo : null); sh.set(h + 2, L, 13, c === 4 ? 'SUB TRAMO ' + st.numero + ': ' + st.nombre : null); }
  sh.merge('D' + h + ':V' + h); sh.merge('D' + (h + 1) + ':V' + (h + 1)); sh.merge('D' + (h + 2) + ':V' + (h + 2));
}
function headerPu(sh, h, med, st) {
  sh.row(h, 'ht="18" customHeight="1"'); sh.row(h + 1, 'ht="15.6" customHeight="1"'); sh.row(h + 2, 'ht="15.6" customHeight="1"');
  for (let c = 4; c <= 22; c++) {
    const L = LET[c - 1];
    sh.set(h, L, c === 4 ? 38 : c === 6 ? 36 : 35, c === 4 ? 'LECTURA DE LA FRICCIÓN CON PÉNDULO TRRL' : null);
    sh.set(h + 1, L, c === 4 ? 34 : c === 6 ? 36 : c === 22 ? 24 : 35, c === 4 ? med.titulo : null);
    sh.set(h + 2, L, c === 4 ? 34 : c === 6 ? 36 : 35, c === 4 ? 'SUB TRAMO ' + st.numero + ': ' + st.nombre : null);
  }
  sh.merge('D' + h + ':V' + h); sh.merge('D' + (h + 1) + ':U' + (h + 1)); sh.merge('D' + (h + 2) + ':V' + (h + 2));
}

/* Encabezados de bloque (título + 2 filas de encabezado) */
function blockHead(sh, r, T, titulo, withProgCols) {
  sh.row(r, 'ht="18" customHeight="1"');
  for (const [L, s] of Object.entries(T.title)) sh.set(r, L, s, L === 'G' ? titulo : null);
  sh.merge('G' + r + ':P' + r);
  sh.row(r + 1, 's="' + (withProgCols ? 18 : 4) + '" customFormat="1" ht="20.25" customHeight="1"');
  const t1 = { D: 'CARRIL DERECHO', E: 'CARRIL IZQUIERDO', G: 'LECTURAS CARRIL DERECHO', L: 'LECTURAS CARRIL IZQUIERDO', Q: 'BPN', R: 'BPNA', S: 'CRD', U: 'TEMPERATURA (C°)', W: 'Fac. Correc.      FA(20)' };
  for (const [L, s] of Object.entries(T.hdr1)) sh.set(r + 1, L, s, t1[L] || null);
  sh.row(r + 2, withProgCols ? 'ht="14.25" customHeight="1"' : '');
  const t2 = { D: 'HUELLA EXTERNA', E: 'HUELLA EXTERNA', U: 'AMBIENTE', V: 'AGUA' };
  C5_D.forEach((L, i) => t2[L] = 'L' + (i + 1)); C5_I.forEach((L, i) => t2[L] = 'L' + (i + 1));
  if (withProgCols) t2.B = 'PROGRESIVA'; else t2.C = 'UBICACIÓN';
  for (const [L, s] of Object.entries(T.hdr2)) sh.set(r + 2, L, s, t2[L] || null);
  ['G7:K7', 'L7:P7', 'Q7:Q8', 'R7:R8', 'S7:S8', 'U7:V7', 'W7:W8'].forEach(m => {
    const [a, b] = m.split(':'); sh.merge(a[0] + (r + 1) + ':' + b[0] + (b[1] === '8' ? r + 2 : r + 1));
  });
  if (withProgCols) sh.merge('B' + (r + 2) + ':C' + (r + 2));
}

/* Fila de datos con fórmulas (guardadas con el valor calculado en caché) */
function dataCells(sh, row, p, S, bVal, bFormula, bCache, cVal) {
  const c = calcPunto(p);
  C5_D.forEach((L, i) => sh.set(row, L, S[L], numOf(p.d[i])));
  C5_I.forEach((L, i) => sh.set(row, L, S[L], numOf(p.i[i])));
  sh.set(row, 'U', S.U, numOf(p.ta)); sh.set(row, 'V', S.V, numOf(p.tw));
  sh.set(row, 'Q', S.Q, null, `IF(COUNT(G${row}:P${row})=0,"",AVERAGE(G${row}:P${row}))`, c.q === null ? '' : c.q);
  sh.set(row, 'R', S.R, null, `IF(OR(Q${row}="",W${row}=""),"",ROUND(Q${row}*W${row},1))`, c.r === null ? '' : c.r);
  sh.set(row, 'S', S.S, null, `IF(R${row}="","",ROUND(R${row}/100,2))`, c.s === null ? '' : c.s);
  sh.set(row, 'W', S.W, null, `IF(V${row}="","",1/(1-0.00525*(V${row}-20)))`, c.w === null ? '' : c.w);
  if (S.T !== undefined) sh.set(row, 'T', S.T, null);
}

/* ---------- Modo "km sorteados" (un solo hoja, como IIRSA Centro) ---------- */
function buildKmSheet(med, sst) {
  const sh = new Sheet(sst); const anchors = []; const breaks = []; const cf = [];
  let r = 2;
  med.subtramos.forEach((st, si) => {
    const h = r; headerKm(sh, h, med, st); anchors.push(h);
    r = h + 4; let onPage = 0, cap = 2;
    st.items.forEach((it, bi) => {
      const t = r;
      blockHead(sh, t, KM, it.calzada === 'DERECHA' ? 'CALZADA DERECHA' : it.calzada === 'IZQUIERDA' ? 'CALZADA IZQUIERDA' : 'CALZADA ÚNICA', true);
      for (let k = 0; k < 11; k++) {
        const row = t + 3 + k, S = k === 0 ? KM.d0 : KM.dN, prog = it.km * 1000 + k * 100;
        if (k === 0) sh.set(row, 'A', S.A, 'KM.');
        if (k === 0) sh.set(row, 'B', S.B, prog); else sh.set(row, 'B', S.B, null, `B${row - 1}+100`, prog);
        sh.set(row, 'C', S.C, null, `B${row}`, prog);
        sh.set(row, 'D', S.D, 'X'); sh.set(row, 'E', S.E, 'X'); sh.set(row, 'F', S.F, null);
        dataCells(sh, row, it.puntos[k], S);
      }
      const br = t + 14; for (const [L, s] of Object.entries(KM.blank)) sh.set(br, L, s, null);
      cf.push('S' + (t + 3) + ':S' + (t + 13));
      r += 15; onPage++;
      if (bi < st.items.length - 1 && onPage === cap) { breaks.push(r - 1); onPage = 0; cap = 3; }
    });
    if (si < med.subtramos.length - 1) { breaks.push(r - 1); r = r + 1; }
  });
  return { sh, last: Math.max(r - 1, 5), anchors, breaks, cf };
}

/* ---------- Modo "puentes" (una hoja por subtramo) ---------- */
function buildPuenteSheet(med, st, sst) {
  const sh = new Sheet(sst); const breaks = [];
  headerPu(sh, 2, med, st);
  let r = 6;
  st.items.forEach((it, bi) => {
    const t = r;
    blockHead(sh, t, PU, it.nombre, false);
    it.puntos.forEach((p, k) => {
      const row = t + 3 + k, S = k === 0 ? PU.d0 : PU.dN;
      if (k === 0) { sh.set(row, 'A', S.A, 'KM.'); sh.set(row, 'B', S.B, it.prog); } else sh.set(row, 'B', S.B, null);
      sh.set(row, 'C', S.C, p.u); sh.set(row, 'D', S.D, 'X'); sh.set(row, 'E', S.E, 'X');
      dataCells(sh, row, p, S);
    });
    r += 7;
    if ((bi + 1) % 5 === 0 && bi < st.items.length - 1) breaks.push(r - 1);
  });
  return { sh, last: st.items.length ? r - 2 : 11, anchors: [2], breaks, cf: [] };
}

/* ---------- Ensamblado del libro ---------- */
function sheetXml(b, kind) {
  const isKm = kind === 'km';
  const A = ASSETS[kind];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><tabColor rgb="' + (isKm ? 'FFFFC000' : 'FF00B050') + '"/></sheetPr><dimension ref="A2:X' + b.last + '"/>' +
    '<sheetViews><sheetView ' + (b.first ? 'tabSelected="1" ' : '') + (isKm ? 'view="pageBreakPreview" zoomScale="60" zoomScaleNormal="60"' : 'zoomScale="70"') + ' workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>' +
    '<sheetFormatPr baseColWidth="10" defaultColWidth="11.44140625" defaultRowHeight="14.4"/>' + A.cols +
    b.sh.dataXml() +
    '<mergeCells count="' + b.sh.merges.length + '">' + b.sh.merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>' +
    (b.cf.length ? '<conditionalFormatting sqref="' + b.cf.join(' ') + '"><cfRule type="cellIs" dxfId="0" priority="1" operator="lessThan"><formula>0.4</formula></cfRule></conditionalFormatting>' : '') +
    '<printOptions horizontalCentered="1"/><pageMargins left="0.511811" right="0.511811" top="0.511811" bottom="0.511811" header="0.314961" footer="0.314961"/>' +
    '<pageSetup paperSize="9" scale="' + (isKm ? 72 : 71) + '" ' + (isKm ? '' : 'fitToHeight="0" ') + 'orientation="landscape"/>' +
    (b.breaks.length ? '<rowBreaks count="' + b.breaks.length + '" manualBreakCount="' + b.breaks.length + '">' + b.breaks.map(x => '<brk id="' + x + '" max="16383" man="1"/>').join('') + '</rowBreaks>' : '') +
    '<drawing r:id="rId1"/></worksheet>';
}
function drawingXml(anchors, kind) {
  const A = ASSETS[kind]; let id = 2, out = '';
  for (const h of anchors) {
    for (const key of ['a1', 'a2']) out += A[key].replace('{R0}', h - 1).replace('{R1}', h + 2).replace('{ID}', id++);
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + out + '</xdr:wsDr>';
}
function sheetNameOk(n, used) {
  let b = String(n).replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let nm = b, i = 2; while (used.has(nm.toLowerCase())) { const suf = ' (' + i++ + ')'; nm = b.slice(0, 31 - suf.length) + suf; }
  used.add(nm.toLowerCase()); return nm;
}

async function exportXlsx(med) {
  const kind = med.tipo === 'km' ? 'km' : 'pu'; const A = ASSETS[kind];
  const sst = new SST(); const used = new Set(); const sheets = [];
  if (kind === 'km') {
    const b = buildKmSheet(med, sst); b.first = true;
    sheets.push({ name: sheetNameOk(med.corto || 'Pendulo', used), b });
  } else {
    const subs = med.subtramos.length ? med.subtramos : [];
    subs.forEach((st, i) => { const b = buildPuenteSheet(med, st, sst); b.first = i === 0; sheets.push({ name: sheetNameOk('ST' + st.numero, used), b }); });
  }
  if (!sheets.length) throw new Error('No hay subtramos para exportar.');
  const files = []; const add = (name, data) => files.push({ name, data: typeof data === 'string' ? _enc.encode(data) : data });
  const n = sheets.length;
  add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>').join('') +
    '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
  add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  const lastCol = kind === 'km' ? 'W' : 'W';
  add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView xWindow="-108" yWindow="-108" windowWidth="23256" windowHeight="13896" tabRatio="500"/></bookViews><sheets>' +
    sheets.map((s, i) => '<sheet name="' + xesc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><definedNames>' +
    sheets.map((s, i) => '<definedName name="_xlnm.Print_Area" localSheetId="' + i + '">\'' + xesc(s.name.replace(/'/g, "''")) + '\'!$A$2:$' + lastCol + '$' + s.b.last + '</definedName>').join('') +
    '</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
    '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId' + (n + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId' + (n + 3) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>');
  add('xl/styles.xml', A.styles); add('xl/theme/theme1.xml', A.theme);
  const img2 = kind === 'km' ? 'image2.png' : 'image2.jpeg';
  sheets.forEach((s, i) => {
    add('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s.b, kind));
    add('xl/worksheets/_rels/sheet' + (i + 1) + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + (i + 1) + '.xml"/></Relationships>');
    add('xl/drawings/drawing' + (i + 1) + '.xml', drawingXml(s.b.anchors, kind));
    add('xl/drawings/_rels/drawing' + (i + 1) + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + img2 + '"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>');
  });
  add('xl/sharedStrings.xml', sst.xml());
  add('xl/media/image1.png', b64ToU8(ASSETS.ositran)); add('xl/media/' + img2, b64ToU8(kind === 'km' ? ASSETS.apsaPng : ASSETS.apsaJpg));
  return makeZip(files);
}

/* ---------- Lectura del Excel de sorteo ---------- */
function _cellsOf(xml, sst) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'); const out = new Map();
  doc.querySelectorAll('c').forEach(c => {
    const ref = c.getAttribute('r'); const m = ref.match(/^([A-Z]+)(\d+)$/); if (!m) return;
    const t = c.getAttribute('t'); const vEl = c.querySelector('v'); let v = null;
    if (t === 'inlineStr') v = (c.querySelector('t') || {}).textContent || '';
    else if (vEl) { v = vEl.textContent; if (t === 's') v = sst[Number(v)]; else if (t === 'str' || t === 'e') v = v; else { const n = Number(v); v = isFinite(n) ? n : v; } }
    if (v !== null && v !== '') out.set(m[1] + m[2], v);
  });
  return out;
}
async function sorteoSheets(buf) {
  const z = await readZip(buf);
  const wb = new DOMParser().parseFromString(await z.text('xl/workbook.xml'), 'application/xml');
  const rels = new DOMParser().parseFromString(await z.text('xl/_rels/workbook.xml.rels'), 'application/xml');
  const relMap = {}; rels.querySelectorAll('Relationship').forEach(r => relMap[r.getAttribute('Id')] = r.getAttribute('Target'));
  const sstXml = await z.text('xl/sharedStrings.xml'); const sst = [];
  if (sstXml) new DOMParser().parseFromString(sstXml, 'application/xml').querySelectorAll('si').forEach(si => sst.push([...si.querySelectorAll('t')].map(t => t.textContent).join('')));
  const sheets = [];
  wb.querySelectorAll('sheet').forEach(s => {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let tg = relMap[rid] || ''; tg = tg.replace(/^\//, ''); if (!tg.startsWith('xl/')) tg = 'xl/' + tg;
    sheets.push({ name: s.getAttribute('name'), path: tg });
  });
  return { z, sst, sheets };
}
/* Devuelve [{nombre, inicio, fin, kms:[n,...]}] leyendo la tabla "Subtramo ... Tramos a evaluar" */
async function sorteoParse(pack, sheet) {
  const xml = await pack.z.text(sheet.path); const cells = _cellsOf(xml, pack.sst);
  let hdr = null;
  for (const [ref, v] of cells) { if (typeof v === 'string' && v.trim().toLowerCase() === 'subtramo') { const m = ref.match(/^([A-Z]+)(\d+)$/); hdr = { col: m[1], row: Number(m[2]) }; break; } }
  if (!hdr) throw new Error('No se encontró la columna "Subtramo" en esa hoja.');
  let kmCol = null;
  for (const [ref, v] of cells) { const m = ref.match(/^([A-Z]+)(\d+)$/); if (Number(m[2]) <= hdr.row + 1 && typeof v === 'string' && /tramos a evaluar/i.test(v)) { kmCol = m[1]; break; } }
  if (!kmCol) throw new Error('No se encontró la columna "Tramos a evaluar" en esa hoja.');
  const toKm = v => {
    if (typeof v === 'number') return v >= 1000 && v % 1000 === 0 ? v / 1000 : (v < 1000 ? v : null);
    const m = String(v).match(/^\s*(\d+)\s*\+\s*(\d{3})\s*$/); return m && m[2] === '000' ? Number(m[1]) : null;
  };
  const maxRow = Math.max(...[...cells.keys()].map(k => Number(k.match(/\d+/)[0])));
  const res = []; let cur = null;
  for (let r = hdr.row + 1; r <= maxRow; r++) {
    const nm = cells.get(hdr.col + r);
    if (typeof nm === 'string' && nm.trim() && !/^km$/i.test(nm.trim())) {
      cur = { nombre: nm.trim(), kms: [] }; res.push(cur);
      const ci = LET[LET.indexOf(hdr.col) + 1], cf = LET[LET.indexOf(hdr.col) + 2];
      cur.inicio = cells.get(ci + r); cur.fin = cells.get(cf + r);
    }
    const kv = cells.get(kmCol + r);
    if (cur && kv !== undefined) { const k = toKm(kv); if (k !== null && !cur.kms.includes(k)) cur.kms.push(k); }
  }
  return res.filter(s => s.kms.length);
}
