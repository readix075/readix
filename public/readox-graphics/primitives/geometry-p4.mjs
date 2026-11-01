/**
 * Readox V5.2 — Phase 4 : mathématiques pures des primitives et styles avancés
 * (cahier §12, matrice T23–T30). Aucun DOM, aucun état : fonctions déterministes
 * testées par tests/vfe/p4-primitives.test.mjs.
 *
 * Conventions :
 * - Angles en degrés, 0 = est, sens horaire (repère SVG y vers le bas).
 * - Toutes les coordonnées émises sont arrondies à 3 décimales (num()).
 */

const num = (v, p = 3) => { const n = Number(v); if (!Number.isFinite(n)) return 0; const r = +n.toFixed(p); return r === 0 ? 0 : r; /* jamais -0 */ };
export const ARC_STROKE_RATIO = 0.12;

/** Normalise un angle en degrés dans [0, 360[. */
export function normAngle(a) {
  const n = Number(a);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

/** Point d'une ellipse de centre (cx,cy) et rayons (rx,ry) à l'angle donné (degrés, horaire). */
export function ellipsePoint(cx, cy, rx, ry, angleDeg) {
  const t = (normAngle(angleDeg) * Math.PI) / 180;
  return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
}

/**
 * Tracé SVG (attribut d) d'un arc/secteur/anneau inscrit dans la bbox w×h.
 * - mode 'arc'     : trait d'arc elliptique (stroke), de startAngle à endAngle (sens horaire).
 * - mode 'sector'  : secteur fermé vers le centre (fill).
 * - mode 'ring'    : anneau entre le rayon intérieur (1-thickness) et extérieur (fill).
 * thickness ∈ ]0,1] : fraction du rayon pour 'ring'.
 * Angles normalisés ; un tour complet (|end-start| ≥ 360) est rendu comme ellipse(s) fermée(s).
 */
export function arcPath(w, h, startAngle, endAngle, { mode = 'arc', thickness = 0.35 } = {}) {
  const rx = Math.max(0, w / 2), ry = Math.max(0, h / 2);
  if (!rx || !ry) return '';
  const cx = rx, cy = ry;
  const s = normAngle(startAngle);
  let span = normAngle(normAngle(endAngle) - s);
  const rawSpan = Number(endAngle) - Number(startAngle);
  const full = Math.abs(rawSpan) >= 360 || (span === 0 && Number(endAngle) !== Number(startAngle));
  const t = Math.min(0.999, Math.max(0.001, Number(thickness) || 0.35));
  const largeArc = span > 180 ? 1 : 0;
  const sweep = 1; // sens horaire
  if (full || span === 0) {
    // Tour complet : deux demi-arcs.
    if (mode === 'ring') {
      const irx = rx * (1 - t), iry = ry * (1 - t);
      return `M ${num(cx + rx)} ${num(cy)} A ${num(rx)} ${num(ry)} 0 1 1 ${num(cx - rx)} ${num(cy)} A ${num(rx)} ${num(ry)} 0 1 1 ${num(cx + rx)} ${num(cy)} Z `
        + `M ${num(cx + irx)} ${num(cy)} A ${num(irx)} ${num(iry)} 0 1 0 ${num(cx - irx)} ${num(cy)} A ${num(irx)} ${num(iry)} 0 1 0 ${num(cx + irx)} ${num(cy)} Z`;
    }
    return `M ${num(cx + rx)} ${num(cy)} A ${num(rx)} ${num(ry)} 0 1 1 ${num(cx - rx)} ${num(cy)} A ${num(rx)} ${num(ry)} 0 1 1 ${num(cx + rx)} ${num(cy)} Z`;
  }
  const p0 = ellipsePoint(cx, cy, rx, ry, s), p1 = ellipsePoint(cx, cy, rx, ry, s + span);
  const arcSeg = `A ${num(rx)} ${num(ry)} 0 ${largeArc} ${sweep} ${num(p1.x)} ${num(p1.y)}`;
  if (mode === 'sector') return `M ${num(cx)} ${num(cy)} L ${num(p0.x)} ${num(p0.y)} ${arcSeg} Z`;
  if (mode === 'ring') {
    const irx = rx * (1 - t), iry = ry * (1 - t);
    const q1 = ellipsePoint(cx, cy, irx, iry, s + span), q0 = ellipsePoint(cx, cy, irx, iry, s);
    return `M ${num(p0.x)} ${num(p0.y)} ${arcSeg} L ${num(q1.x)} ${num(q1.y)} `
      + `A ${num(irx)} ${num(iry)} 0 ${largeArc} 0 ${num(q0.x)} ${num(q0.y)} Z`;
  }
  return `M ${num(p0.x)} ${num(p0.y)} ${arcSeg}`; // arc ouvert (stroke)
}

/** Points d'un polygone régulier à n côtés inscrit dans w×h (départ à -90° = haut). */
export function polygonPoints(w, h, sides = 5) {
  const n = Math.max(3, Math.round(sides) || 3);
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(ellipsePoint(cx, cy, rx, ry, -90 + (360 * i) / n));
  return pts;
}

/** Points d'une étoile à n branches (rayon intérieur = innerRatio × rayon). */
export function starPoints(w, h, branches = 5, innerRatio = 0.45) {
  const n = Math.max(2, Math.round(branches) || 5);
  const ir = Math.min(0.95, Math.max(0.05, Number(innerRatio) || 0.45));
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push(ellipsePoint(cx, cy, rx, ry, -90 + (360 * i) / n));
    pts.push(ellipsePoint(cx, cy, rx * ir, ry * ir, -90 + (360 * (i + 0.5)) / n));
  }
  return pts;
}

/** Convertit une liste de points en attribut d (M … L … Z). */
export function pointsToPath(pts) {
  if (!pts.length) return '';
  return 'M ' + pts.map(p => `${num(p.x)} ${num(p.y)}`).join(' L ') + ' Z';
}

// ─── Chemins (attribut d) : analyse, édition de points, bbox ────────────────

/**
 * Analyse un attribut d limité aux commandes M/L/C/Q/H/V/Z (absolues et relatives).
 * Retourne une liste de segments normalisés absolus :
 *   { cmd:'M'|'L', x, y } | { cmd:'C', x1,y1,x2,y2,x,y } | { cmd:'Q', x1,y1,x,y } | { cmd:'Z' }
 * Lève Error('PATH_INVALID') sur commande non prise en charge (A/S/T) ou syntaxe.
 */
export function parsePathD(d) {
  const tokens = String(d || '').match(/[a-zA-Z]|-?\.?\d+(?:\.\d+)?(?:e-?\d+)?/g) || [];
  const segs = [];
  let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0;
  const numTok = () => { const v = parseFloat(tokens[i++]); if (!Number.isFinite(v)) throw Error('PATH_INVALID'); return v; };
  const isCmd = t => typeof t === 'string' && /^[a-zA-Z]$/.test(t);
  while (i < tokens.length) {
    if (isCmd(tokens[i])) { cmd = tokens[i++]; }
    if (!cmd) throw Error('PATH_INVALID');
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { segs.push({ cmd: 'Z' }); cx = sx; cy = sy; cmd = null; continue; }
    if (C === 'M') {
      const x = numTok(), y = numTok();
      cx = rel ? cx + x : x; cy = rel ? cy + y : y; sx = cx; sy = cy;
      segs.push({ cmd: 'M', x: cx, y: cy });
      cmd = rel ? 'l' : 'L'; // paires suivantes = L implicites
      continue;
    }
    if (C === 'L') {
      const x = numTok(), y = numTok();
      cx = rel ? cx + x : x; cy = rel ? cy + y : y;
      segs.push({ cmd: 'L', x: cx, y: cy });
      continue;
    }
    if (C === 'H') {
      const x = numTok(); cx = rel ? cx + x : x;
      segs.push({ cmd: 'L', x: cx, y: cy });
      continue;
    }
    if (C === 'V') {
      const y = numTok(); cy = rel ? cy + y : y;
      segs.push({ cmd: 'L', x: cx, y: cy });
      continue;
    }
    if (C === 'C') {
      const x1 = numTok(), y1 = numTok(), x2 = numTok(), y2 = numTok(), x = numTok(), y = numTok();
      const s = { cmd: 'C', x1: rel ? cx + x1 : x1, y1: rel ? cy + y1 : y1, x2: rel ? cx + x2 : x2, y2: rel ? cy + y2 : y2, x: rel ? cx + x : x, y: rel ? cy + y : y };
      cx = s.x; cy = s.y; segs.push(s);
      continue;
    }
    if (C === 'Q') {
      const x1 = numTok(), y1 = numTok(), x = numTok(), y = numTok();
      const s = { cmd: 'Q', x1: rel ? cx + x1 : x1, y1: rel ? cy + y1 : y1, x: rel ? cx + x : x, y: rel ? cy + y : y };
      cx = s.x; cy = s.y; segs.push(s);
      continue;
    }
    throw Error('PATH_INVALID'); // A, S, T et toute autre commande : rejet explicite
  }
  return segs;
}

/** Reconstruit un attribut d absolu et arrondi à partir des segments analysés. */
export function buildPathD(segs) {
  return segs.map(s => {
    if (s.cmd === 'Z') return 'Z';
    if (s.cmd === 'C') return `C ${num(s.x1)} ${num(s.y1)} ${num(s.x2)} ${num(s.y2)} ${num(s.x)} ${num(s.y)}`;
    if (s.cmd === 'Q') return `Q ${num(s.x1)} ${num(s.y1)} ${num(s.x)} ${num(s.y)}`;
    return `${s.cmd} ${num(s.x)} ${num(s.y)}`;
  }).join(' ');
}

/**
 * Déplace le point n° index (ordre d'apparition des points éditables : ancres et
 * poignées de contrôle) de (dx,dy). Retourne de nouveaux segments (immuabilité).
 */
export function movePathPoint(segs, index, dx, dy) {
  let n = -1;
  return segs.map(s => {
    const c = { ...s };
    if (c.cmd === 'Z') return c;
    if (c.cmd === 'C') {
      n++; if (n === index) { c.x1 += dx; c.y1 += dy; }
      n++; if (n === index) { c.x2 += dx; c.y2 += dy; }
      n++; if (n === index) { c.x += dx; c.y += dy; }
      return c;
    }
    if (c.cmd === 'Q') {
      n++; if (n === index) { c.x1 += dx; c.y1 += dy; }
      n++; if (n === index) { c.x += dx; c.y += dy; }
      return c;
    }
    n++; if (n === index) { c.x += dx; c.y += dy; }
    return c;
  });
}

/** Boîte englobante approchée d'un tracé (échantillonnage des courbes). */
export function pathBounds(segs) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let px = 0, py = 0, sx0 = 0, sy0 = 0, has = false;
  const eat = (x, y) => { has = true; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
  for (const s of segs) {
    if (s.cmd === 'Z') { px = sx0; py = sy0; continue; }
    if (s.cmd === 'M') { px = s.x; py = s.y; sx0 = px; sy0 = py; eat(px, py); continue; }
    if (s.cmd === 'L') { px = s.x; py = s.y; eat(px, py); continue; }
    if (s.cmd === 'Q') {
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        eat(u * u * px + 2 * u * t * s.x1 + t * t * s.x, u * u * py + 2 * u * t * s.y1 + t * t * s.y);
      }
      px = s.x; py = s.y; continue;
    }
    if (s.cmd === 'C') {
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        eat(u * u * u * px + 3 * u * u * t * s.x1 + 3 * u * t * t * s.x2 + t * t * t * s.x,
          u * u * u * py + 3 * u * u * t * s.y1 + 3 * u * t * t * s.y2 + t * t * t * s.y);
      }
      px = s.x; py = s.y; continue;
    }
  }
  if (!has) return null;
  return { x: num(minX), y: num(minY), w: num(maxX - minX), h: num(maxY - minY) };
}

/** Translate tous les segments de (dx,dy). */
export function translatePath(segs, dx, dy) {
  return segs.map(s => {
    if (s.cmd === 'Z') return s;
    const c = { ...s, x: s.x + dx, y: s.y + dy };
    if (s.cmd === 'C' || s.cmd === 'Q') { c.x1 = s.x1 + dx; c.y1 = s.y1 + dy; }
    if (s.cmd === 'C') { c.x2 = s.x2 + dx; c.y2 = s.y2 + dy; }
    return c;
  });
}

// ─── Remplissage : solide / dégradé linéaire / radial (T25, T28) ────────────

/**
 * Normalise le remplissage d'un objet : it.fill (dégradé) prime sur it.bg.
 * Retourne { kind:'solid', color } | { kind:'linear'|'radial', angle, stops }
 * avec stops triés par offset et alpha borné [0,1].
 */
export function normalizeFill(it) {
  const f = it?.fill;
  if (f && (f.type === 'linear' || f.type === 'radial') && Array.isArray(f.stops) && f.stops.length >= 2) {
    const stops = f.stops
      .map(s => ({ offset: Math.min(1, Math.max(0, Number(s.offset) || 0)), color: String(s.color || '#000000'), alpha: Math.min(1, Math.max(0, s.alpha === undefined ? 1 : Number(s.alpha) || 0)) }))
      .sort((a, b) => a.offset - b.offset);
    return { kind: f.type, angle: Number(f.angle) || 0, stops };
  }
  return { kind: 'solid', color: String(it?.bg || '#ffffff') };
}

/** Couleur + alpha → hexadécimal 8 chiffres (CSS). */
function hex8(color, alpha) {
  const { r, g, b } = hexToRgb(color);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a}`;
}

/** Remplissage → valeur CSS (background). Angle CSS = angle + 90 (0° = est). */
export function fillToCss(fill) {
  if (fill.kind === 'solid') return fill.color;
  const stops = fill.stops.map(s => `${hex8(s.color, s.alpha)} ${num(s.offset * 100, 1)}%`).join(', ');
  if (fill.kind === 'radial') return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${num(fill.angle + 90, 1)}deg, ${stops})`;
}

/**
 * Remplissage → définition SVG (objectBoundingBox) à insérer dans <defs>.
 * angle 0° = est : x1=0.5−cos/2, y1=0.5−sin/2, x2=0.5+cos/2, y2=0.5+sin/2.
 * L'alpha devient stop-opacity.
 */
export function fillToSvgDef(fill, id) {
  if (fill.kind === 'solid') return '';
  const stops = fill.stops.map(s =>
    `<stop offset="${num(s.offset * 100, 1)}%" stop-color="${esc6(s.color)}"${s.alpha < 1 ? ` stop-opacity="${num(s.alpha)}"` : ''}/>`).join('');
  if (fill.kind === 'radial') return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`;
  const t = (normAngle(fill.angle) * Math.PI) / 180, c = Math.cos(t) / 2, s = Math.sin(t) / 2;
  return `<linearGradient id="${id}" x1="${num(0.5 - c)}" y1="${num(0.5 - s)}" x2="${num(0.5 + c)}" y2="${num(0.5 + s)}">${stops}</linearGradient>`;
}
const esc6 = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// ─── Masques d'écrêtage (T26) ────────────────────────────────────────────────

/**
 * Normalise le masque d'un objet : { type:'ellipse' } | { type:'roundedRect', radius }
 * | { type:'rect' } | null. Le rayon est borné à min(w,h)/2 par l'appelant (maskToCss).
 */
export function normalizeMask(it) {
  const m = it?.mask;
  if (!m || typeof m !== 'object') return null;
  if (m.type === 'ellipse') return { type: 'ellipse' };
  if (m.type === 'roundedRect') return { type: 'roundedRect', radius: Math.max(0, Number(m.radius) || 0) };
  if (m.type === 'rect') return { type: 'rect' };
  return null;
}

/** Masque → clip-path CSS (ellipse ou rectangle arrondi au rayon borné). */
export function maskToCss(mask, w, h) {
  if (!mask) return '';
  if (mask.type === 'ellipse') return 'ellipse(50% 50% at 50% 50%)';
  if (mask.type === 'rect') return 'inset(0 0 0 0)';
  const r = Math.min(Number(mask.radius) || 0, Math.min(w, h) / 2);
  return `inset(0 0 0 0 round ${num(r)}px)`;
}

/** Masque → contenu d'un <clipPath> SVG (coordonnées page absolues de l'objet). */
export function maskToSvgBody(mask, it) {
  if (!mask) return '';
  const x = num(it.x), y = num(it.y), w = num(it.w), h = num(it.h);
  if (mask.type === 'ellipse') return `<ellipse cx="${num(it.x + it.w / 2)}" cy="${num(it.y + it.h / 2)}" rx="${num(it.w / 2)}" ry="${num(it.h / 2)}"/>`;
  if (mask.type === 'rect') return `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const r = num(Math.min(Number(mask.radius) || 0, Math.min(it.w, it.h) / 2));
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
}

// ─── Groupes (T30) ───────────────────────────────────────────────────────────

/**
 * Répercute sur les enfants (coordonnées page ABSOLUES) le delta d'un groupe :
 * translation (dx,dy), homothétie (sx,sy) depuis l'origine NW `origin`,
 * rotation drot (degrés) autour de `center`. La taille de fonte (size) est mise
 * à l'échelle par la moyenne des facteurs.
 */
export function applyGroupDelta(children, { dx = 0, dy = 0, sx = 1, sy = 1, drot = 0, origin, center }) {
  const t = (normAngle(drot) * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  for (const c of children) {
    if (!c || typeof c !== 'object') continue;
    // Homothétie depuis l'origine NW du groupe, puis translation.
    let x = origin.x + (c.x - origin.x) * sx + dx, y = origin.y + (c.y - origin.y) * sy + dy;
    let w = c.w * sx, h = c.h * sy;
    if (drot) {
      // Rotation des centres autour du centre du groupe.
      const ccx = x + w / 2, ccy = y + h / 2;
      const rx = center.x + (ccx - center.x) * cos - (ccy - center.y) * sin;
      const ry = center.y + (ccx - center.x) * sin + (ccy - center.y) * cos;
      x = rx - w / 2; y = ry - h / 2;
      c.rotation = num((Number(c.rotation) || 0) + drot);
    }
    c.x = num(x); c.y = num(y); c.w = num(Math.max(1, w)); c.h = num(Math.max(1, h));
    if (Number.isFinite(c.size) && (sx !== 1 || sy !== 1)) c.size = num(Math.max(4, c.size * (Math.abs(sx) + Math.abs(sy)) / 2));
    if (c.type === 'group' && Array.isArray(c.children)) {
      // Sous-groupe : même delta, récursion (origine/centre du groupe parent).
      applyGroupDelta(c.children, { dx: 0, dy: 0, sx, sy, drot, origin: { x: origin.x, y: origin.y }, center });
    }
  }
}

/** Boîte englobante de l'union d'objets {x,y,w,h}. */
export function unionBounds(items) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, has = false;
  for (const it of items) {
    if (!it || ![it.x, it.y, it.w, it.h].every(Number.isFinite)) continue;
    has = true;
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
    if (it.y + it.h > maxY) maxY = it.y + it.h;
  }
  if (!has) return null;
  return { x: num(minX), y: num(minY), w: num(maxX - minX), h: num(maxY - minY) };
}

// ─── Couleurs déterministes (T28) ────────────────────────────────────────────

/** '#rgb' | '#rrggbb' | '#rrggbbaa' → {r,g,b} (0-255). */
export function hexToRgb(hex) {
  let s = String(hex || '').trim().replace(/^#/, '');
  if (s.length === 3 || s.length === 4) s = [...s].map(c => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  if (!Number.isFinite(n) || s.length < 6) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** {r,g,b} (0-255) → {h (0-360), s, l (0-100)}. */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: num(((h % 360) + 360) % 360, 1), s: num(s * 100, 1), l: num(l * 100, 1) };
}

/** h (0-360), s, l (0-100) → '#rrggbb'. */
export function hslToHex(h, s, l) {
  h = normAngle(h); s = Math.min(100, Math.max(0, Number(s) || 0)) / 100; l = Math.min(100, Math.max(0, Number(l) || 0)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export { num };
