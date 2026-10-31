/** VFE — Rendu SVG déterministe du plan de scène (cahier des charges §6.7, §7).
 * Pure fonction plan -> chaîne SVG : utilisée pour l'aperçu, les miniatures et
 * l'export ; rasterisable ensuite en PNG/JPG à n'importe quel DPI dans le
 * navigateur. Aucune dépendance à Fabric ni au DOM.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const num = v => Number.isFinite(+v) ? +(+v).toFixed(4) : 0;

function matrixAttr(m) {
  // Matrice affine [a,b,c,d,e,f] colonne, identique au calcul documentaire.
  if (!m) return '';
  const [a, b, c, d, e, f] = m;
  if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) return '';
  return ` transform="matrix(${num(a)} ${num(b)} ${num(c)} ${num(d)} ${num(e)} ${num(f)})"`;
}

function paintAttrs(op) {
  let s = '';
  if (op.opacity !== 1) s += ` opacity="${num(op.opacity)}"`;
  if (op.blendMode && op.blendMode !== 'normal') s += ` style="mix-blend-mode:${esc(op.blendMode)}"`;
  return s;
}

function clipDef(op, index) {
  const id = `vfe-clip-${index}`;
  const rx = op.spec?.cornerRadius || 0;
  return {
    id,
    def: `<clipPath id="${id}"><rect x="${num(op.x)}" y="${num(op.y)}" width="${num(op.width)}" height="${num(op.height)}"${rx ? ` rx="${num(rx)}"` : ''}/></clipPath>`
  };
}

function imageHref(op) {
  const { fit = 'cover', crop, focal = { x: 0.5, y: 0.5 } } = op.spec || {};
  let ratio = 'xMidYMid slice';
  if (fit === 'contain') ratio = 'xMidYMid meet';
  if (fit === 'stretch') ratio = 'none';
  if (crop && Number.isFinite(crop.x)) {
    // Recadrage non destructif : viewBox sur la portion conservée.
    return { ratio, viewBox: `${num(crop.x)} ${num(crop.y)} ${num(crop.width)} ${num(crop.height)}` };
  }
  if (fit === 'cover' && (focal.x !== 0.5 || focal.y !== 0.5)) {
    const px = Math.round(focal.x * 100), py = Math.round(focal.y * 100);
    ratio = `x${focal.x < 0.5 ? 'Min' : focal.x > 0.5 ? 'Max' : 'Mid'}Y${focal.y < 0.5 ? 'Min' : focal.y > 0.5 ? 'Max' : 'Mid'} slice`;
    void px; void py;
  }
  return { ratio, viewBox: null };
}

function renderOp(op, index, defs) {
  const common = matrixAttr(op.matrix) + paintAttrs(op);
  switch (op.kind) {
    case 'rect': {
      const fill = op.fill || 'none';
      const stroke = op.stroke ? ` stroke="${esc(op.stroke)}" stroke-width="${num(op.strokeWidth || 1)}"` : '';
      return `<rect x="${num(op.x)}" y="${num(op.y)}" width="${num(op.width)}" height="${num(op.height)}"${op.radius ? ` rx="${num(op.radius)}"` : ''} fill="${esc(fill)}"${stroke}${common}/>`;
    }
    case 'ellipse':
      return `<ellipse cx="${num(op.x + op.width / 2)}" cy="${num(op.y + op.height / 2)}" rx="${num(op.width / 2)}" ry="${num(op.height / 2)}" fill="${esc(op.fill || 'none')}"${common}/>`;
    case 'line':
      return `<line x1="${num(op.x)}" y1="${num(op.y)}" x2="${num(op.x + op.width)}" y2="${num(op.y + op.height)}" stroke="${esc(op.stroke || op.fill || '#000')}" stroke-width="${num(op.strokeWidth || 2)}"${common}/>`;
    case 'polygon': {
      let pts = op.points;
      if (!pts) {
        // Forme régulière de repli documentée : seulement si aucun point fourni.
        const n = 4; pts = Array.from({ length: n }, (_, i) => ({ x: op.x + op.width / 2 + Math.cos(-Math.PI / 2 + 2 * Math.PI * i / n) * op.width / 2, y: op.y + op.height / 2 + Math.sin(-Math.PI / 2 + 2 * Math.PI * i / n) * op.height / 2 }));
      }
      const attr = op.closed === false ? 'polyline' : 'polygon';
      const fill = op.closed === false ? 'none' : (op.fill || 'none');
      return `<${attr} points="${pts.map(p => num(p.x) + ',' + num(p.y)).join(' ')}" fill="${esc(fill)}"${op.stroke ? ` stroke="${esc(op.stroke)}" stroke-width="${num(op.strokeWidth || 1)}"` : ''}${common}/>`;
    }
    case 'path':
      if (!op.d) return `<!-- path sans donnée : ${esc(op.id)} -->`;
      return `<path d="${esc(op.d)}" fill="${esc(op.fill || 'none')}"${op.stroke ? ` stroke="${esc(op.stroke)}" stroke-width="${num(op.strokeWidth || 2)}"` : ''}${common}/>`;
    case 'text': {
      const ty = op.typography || {};
      const size = num(ty.fontSize || 24);
      const family = esc(ty.fontFamily || 'Arial');
      const weight = ty.fontWeight || 'normal';
      const style = ty.fontStyle || 'normal';
      const spacing = ty.letterSpacing ? ` letter-spacing="${num(ty.letterSpacing)}"` : '';
      const anchor = ty.textAlign === 'center' ? 'middle' : ty.textAlign === 'right' ? 'end' : 'start';
      const tx = anchor === 'middle' ? op.x + op.width / 2 : anchor === 'end' ? op.x + op.width : op.x;
      const lines = String(op.text ?? '').split(/\r?\n/);
      const spans = lines.map((line, i) => `<tspan x="${num(tx)}" dy="${i ? '1.18em' : '0'}">${esc(line)}</tspan>`).join('');
      return `<text x="${num(tx)}" y="${num(op.y + size)}" font-family="${family}" font-size="${size}" font-weight="${esc(weight)}" font-style="${esc(style)}" text-anchor="${anchor}"${spacing} fill="${esc(op.fill || '#111111')}"${common}>${spans}</text>`;
    }
    case 'image': {
      if (!op.uri) return `<!-- image sans URI : ${esc(op.id)} -->`;
      const { ratio, viewBox } = imageHref(op);
      const clip = clipDef(op, index);
      defs.push(clip.def);
      return `<image x="${num(op.x)}" y="${num(op.y)}" width="${num(op.width)}" height="${num(op.height)}" preserveAspectRatio="${ratio}" href="${esc(op.uri)}" clip-path="url(#${clip.id})"${common}/>`;
    }
    case 'svg':
      if (!op.svg) return `<!-- svg manquant : ${esc(op.id)} -->`;
      return `<g transform="translate(${num(op.x)} ${num(op.y)})"${paintAttrs(op)}>${op.svg}</g>`;
    case 'group':
      return `<!-- groupe ${esc(op.id)} : enfants rendus à plat, ordre conservé -->`;
    case 'draftPlaceholder':
      return `<g${common}><rect x="${num(op.x)}" y="${num(op.y)}" width="${num(op.width)}" height="${num(op.height)}" fill="rgba(200,166,106,0.10)" stroke="#C8A66A" stroke-dasharray="8 5" stroke-width="2"/>` +
        `<text x="${num(op.x + 8)}" y="${num(op.y + 20)}" font-family="monospace" font-size="13" fill="#C8A66A">${esc(op.label)}</text>` +
        `<line x1="${num(op.x)}" y1="${num(op.y)}" x2="${num(op.x + op.width)}" y2="${num(op.y + op.height)}" stroke="#C8A66A" stroke-width="1" stroke-dasharray="4 4"/></g>`;
    case 'unsupported':
      return `<g${common}><rect x="${num(op.x)}" y="${num(op.y)}" width="${num(op.width)}" height="${num(op.height)}" fill="none" stroke="#B8541E" stroke-dasharray="6 4" stroke-width="1.5"/>` +
        `<text x="${num(op.x + 4)}" y="${num(op.y + 14)}" font-family="monospace" font-size="11" fill="#B8541E">[non pris en charge : ${esc(op.type)}]</text></g>`;
    default:
      return `<!-- op inconnue : ${esc(op.kind)} -->`;
  }
}

export function renderSVG(plan, { title = 'Readox VFE' } = {}) {
  if (plan?.format !== 'readox-vfe-renderplan') throw Error('RENDER_PLAN_REQUIRED');
  const defs = [];
  const body = plan.ops.map((op, i) => renderOp(op, i, defs)).join('\n');
  const w = num(plan.page.width), h = num(plan.page.height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title>` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    `<rect width="${w}" height="${h}" fill="${esc(plan.page.background)}"/>` +
    body + `</svg>`;
}
