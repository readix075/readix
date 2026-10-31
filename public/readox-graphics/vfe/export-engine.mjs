/** VFE — Moteur d'export unifié (cahier des charges §6.7, §7, §10 lot D).
 * Toutes les sorties dérivent du même plan de scène (compileScene) :
 *  - SVG  : natif, vectoriel, déterministe ;
 *  - PNG/JPG : rasterisation du SVG à l'échelle demandée (DPI) ;
 *  - PDF  : page unique embarquant le rendu JPEG, tailles de page issues du
 *           document (aucun 510×660 codé en dur).
 * Le rapport d'export liste explicitement ce qui a été rasterisé et les
 * opérations dégradées ; rien n'est modifié silencieusement.
 * Environnement : navigateur (canvas). Sous Node, seules toSVG et le calcul
 * des dimensions sont disponibles — les tests unitaires couvrent ce périmètre.
 */
import { compileScene } from './scene-compiler.mjs';
import { renderSVG } from './svg-renderer.mjs';

export function exportDimensions(page, { scale = null, dpi = null } = {}) {
  const s = scale ?? (dpi ? dpi / 96 : 1);
  if (!Number.isFinite(s) || s <= 0 || s > 16) throw Error('EXPORT_SCALE_INVALID');
  return { scale: s, width: Math.round(page.width * s), height: Math.round(page.height * s) };
}

function buildPDF({ width, height, jpeg }) {
  const enc = new TextEncoder(), parts = [], offsets = [0];
  let length = 0;
  const put = v => { const b = typeof v === 'string' ? enc.encode(v) : v; parts.push(b); length += b.length; };
  const object = (n, body) => { offsets[n] = length; put(n + ' 0 obj\n'); put(body); put('\nendobj\n'); };
  put('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  put(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${jpeg.pixelWidth} /Height ${jpeg.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.bytes.length} >>\nstream\n`);
  put(jpeg.bytes); put('\nendstream\nendobj\n');
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\n`;
  object(5, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);
  const xref = length;
  put('xref\n0 6\n0000000000 65535 f \n');
  for (let n = 1; n <= 5; n++) put(String(offsets[n]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

async function rasterizeSVG(svg, { width, height, mime, quality, background }) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(Error('SVG_RASTER_FAILED')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (mime === 'image/jpeg') { ctx.fillStyle = background || '#ffffff'; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(img, 0, 0, width, height);
    const out = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('CANVAS_ENCODE_FAILED')), mime, quality));
    return out;
  } finally { URL.revokeObjectURL(url); }
}

export class ExportEngine {
  constructor({ resolveAsset, allowDraftPlaceholder = false } = {}) {
    this.resolveAsset = resolveAsset || null;
    this.allowDraftPlaceholder = allowDraftPlaceholder;
  }

  plan(doc, opts) {
    return compileScene(doc, { resolveAsset: this.resolveAsset, allowDraftPlaceholder: this.allowDraftPlaceholder, ...opts });
  }

  /** Export vectoriel : disponible partout, y compris sous Node. */
  toSVG(doc, opts) {
    const plan = this.plan(doc, opts);
    return {
      svg: renderSVG(plan, opts),
      mime: 'image/svg+xml',
      page: plan.page,
      report: this.report(plan, 'svg')
    };
  }

  report(plan, format) {
    const rasterized = [];
    for (const op of plan.ops) {
      if (op.blendMode && op.blendMode !== 'normal' && format !== 'svg') rasterized.push({ id: op.id, what: 'blendMode', mode: op.blendMode });
      if (op.shadow && format !== 'svg') rasterized.push({ id: op.id, what: 'shadow' });
      if (op.spec?.filters?.length && format !== 'svg') rasterized.push({ id: op.id, what: 'filters', count: op.spec.filters.length });
    }
    return {
      format,
      fidelity: plan.report.fidelity,
      rasterized,
      unsupported: plan.report.unsupported,
      missing: plan.report.missing,
      degraded: plan.report.unsupported.length > 0 || plan.report.missing.length > 0
    };
  }

  async toPNG(doc, { scale = 1, dpi = null, ...opts } = {}) {
    const plan = this.plan(doc, opts);
    const dims = exportDimensions(plan.page, { scale: dpi ? null : scale, dpi });
    const svg = renderSVG(plan, opts);
    const blob = await rasterizeSVG(svg, { ...dims, mime: 'image/png' });
    return { blob, mime: 'image/png', ...dims, report: this.report(plan, 'png') };
  }

  async toJPG(doc, { scale = 1, dpi = null, quality = 0.94, ...opts } = {}) {
    const plan = this.plan(doc, opts);
    const dims = exportDimensions(plan.page, { scale: dpi ? null : scale, dpi });
    const svg = renderSVG(plan, opts);
    const blob = await rasterizeSVG(svg, { ...dims, mime: 'image/jpeg', quality, background: plan.page.background });
    return { blob, mime: 'image/jpeg', ...dims, report: { ...this.report(plan, 'jpeg'), transparenceAplatie: true } };
  }

  async toPDF(doc, { dpi = 150, quality = 0.92, ...opts } = {}) {
    const jpg = await this.toJPG(doc, { dpi, quality, ...opts });
    const bytes = new Uint8Array(await jpg.blob.arrayBuffer());
    const blob = buildPDF({
      width: jpg.width * 72 / dpi, height: jpg.height * 72 / dpi,
      jpeg: { bytes, pixelWidth: jpg.width, pixelHeight: jpg.height }
    });
    return {
      blob, mime: 'application/pdf',
      pagePoints: { width: jpg.width * 72 / dpi, height: jpg.height * 72 / dpi },
      report: { ...jpg.report, note: 'PDF page unique, image JPEG embarquée ; texte non vectoriel dans cette version.' }
    };
  }

  /** Miniature : même plan de scène, échelle réduite. Rend le document fourni, pas la scène active. */
  async thumbnail(doc, { maxWidth = 360, ...opts } = {}) {
    const page = (doc.pages || [])[0] || { width: 510 };
    return this.toPNG(doc, { scale: Math.min(1, maxWidth / (page.width || 510)), ...opts });
  }
}
