/* ---------- Panel fotográfico (.docx) ---------- */
const _xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function buildPanelDocx(m, alc) {
  const EMU = 360000, BW = 8.6, BH = 6.4;
  const isKm = m.tipo === 'km';
  const subs = alc === 'all' ? m.subtramos : m.subtramos.filter(s => s.id === alc);
  const media = []; let rid = 0, pid = 0;
  const run = (t, o) => '<w:r><w:rPr>' + (o && o.b ? '<w:b/>' : '') + (o && o.sz ? '<w:sz w:val="' + o.sz + '"/>' : '') + (o && o.c ? '<w:color w:val="' + o.c + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + _xe(t) + '</w:t></w:r>';
  const par = (runs, o) => '<w:p><w:pPr>' + (o && o.pb ? '<w:pageBreakBefore/>' : '') + (o && o.keep ? '<w:keepNext/>' : '') + '<w:spacing w:before="' + ((o && o.before) || 0) + '" w:after="' + ((o && o.after) || 60) + '"/>' + (o && o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') + '</w:pPr>' + runs + '</w:p>';
  async function img(f) {
    const blob = await fotoGet(f.id); if (!blob) return null;
    const u8 = new Uint8Array(await blob.arrayBuffer());
    let w = 4, h = 3; try { const bm = await createImageBitmap(blob); w = bm.width; h = bm.height; bm.close && bm.close(); } catch (e) { }
    let cw = BW, ch = BW * h / w; if (ch > BH) { ch = BH; cw = BH * w / h; }
    const n = ++rid; media.push({ name: 'word/media/img' + n + '.jpg', data: u8, store: true });
    return { rid: 'rId' + (n + 10), cx: Math.round(cw * EMU), cy: Math.round(ch * EMU), id: ++pid };
  }
  const drawing = im => '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + im.cx + '" cy="' + im.cy + '"/><wp:docPr id="' + im.id + '" name="Foto ' + im.id + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + im.id + '" name="img' + im.id + '.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + im.rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + im.cx + '" cy="' + im.cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  const W = 5102; // ancho de columna (twips): (21 - 3) cm / 2
  const cell = (inner) => '<w:tc><w:tcPr><w:tcW w:w="' + W + '" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/></w:tcBorders><w:vAlign w:val="center"/></w:tcPr>' + inner + '</w:tc>';
  async function bloque(titulo, fotos) {
    const ims = []; for (const f of fotos) ims.push(f ? await img(f) : null);
    const c = (i) => {
      if (!ims[i]) return cell(par(run(fotos[i] ? 'Foto no disponible' : 'Sin foto', { c: '888888' }), { jc: 'center', before: 600, after: 600 }));
      return cell(par(drawing(ims[i]), { jc: 'center', before: 60, after: 40 }) + par(run('Foto ' + (i + 1) + ' — ' + fmtFecha(fotos[i].fecha), { sz: 18 }), { jc: 'center', after: 60 }));
    };
    return '<w:tbl><w:tblPr><w:tblW w:w="' + (2 * W) + '" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="' + W + '"/><w:gridCol w:w="' + W + '"/></w:tblGrid>' +
      '<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="' + (2 * W) + '" w:type="dxa"/><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/></w:tcBorders></w:tcPr>' + par(run(titulo, { b: 1 }), { jc: 'center', keep: 1 }) + '</w:tc></w:tr>' +
      '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + c(0) + c(1) + '</w:tr></w:tbl>' + par('', { after: 120 });
  }
  let body = par(run('PANEL FOTOGRÁFICO — ENSAYO DE PÉNDULO TRRL', { b: 1, sz: 28 }), { jc: 'center', after: 80 }) +
    par(run(m.titulo || m.corto, { sz: 22 }), { jc: 'center', after: 40 }) + (m.periodo ? par(run(m.periodo, { sz: 22 }), { jc: 'center', after: 200 }) : '');
  let first = true, any = false;
  for (const s of subs) {
    let sb = '';
    for (const it of s.items) {
      if (isKm) {
        for (let j = 0; j < it.puntos.length; j++) {
          const f = (it.puntos[j].fotos || [null, null]); if (!f[0] && !f[1]) continue;
          sb += await bloque('Km ' + fmtProg(it.km * 1000 + j * 100) + ' · ' + CALZ[it.calzada], f);
        }
      } else sb += await bloque(it.nombre + ' · Progresiva ' + fmtProg(it.prog), it.fotos || [null, null]);
    }
    if (!sb) continue; any = true;
    body += par(run('ST' + s.numero + ': ' + s.nombre, { b: 1, sz: 24 }), { pb: !first, keep: 1, after: 120, before: first ? 120 : 0 }) + sb; first = false;
  }
  if (!any) throw new Error('No hay fotos en el alcance elegido.');
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:lang w:val="es-PE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    media.map((f, i) => '<Relationship Id="rId' + (i + 11) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img' + (i + 1) + '.jpg"/>').join('') + '</Relationships>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
  const root = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const T = s => _enc.encode(s);
  const bytes = await makeZip([{ name: '[Content_Types].xml', data: T(ct) }, { name: '_rels/.rels', data: T(root) }, { name: 'word/document.xml', data: T(doc) }, { name: 'word/styles.xml', data: T(styles) }, { name: 'word/_rels/document.xml.rels', data: T(rels) }, ...media]);
  const sc = alc === 'all' ? '' : ' ST' + (subs[0] ? subs[0].numero : '');
  const name = ('Panel fotografico ' + m.corto + sc + (m.periodo ? '. ' + m.periodo : '') + '.docx').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\\/:*?"<>|]/g, '-');
  return { name, bytes };
}
