/**
 * Readox V5.2 — Phase 4 : primitives et styles avancés (cahier §12,
 * matrice T23–T28). Module greffé sur le circuit existant
 * Interface → Contrôleur → Commande canonique → Scène → Rendu → Export :
 * - rendu DOM via le hook window.__readoxP4ItemContent (appelé par render()) ;
 * - export via les hooks __readoxP4SvgFill / __readoxP4SvgClip / __readoxP4ItemSvg
 *   (appelés par svgDocument()) ;
 * - aucun état parallèle : les données vivent dans items[] (fill, mask, arc, d…).
 */

import {
  normAngle, arcPath, ARC_STROKE_RATIO, polygonPoints, starPoints, pointsToPath,
  parsePathD, buildPathD, movePathPoint, pathBounds, translatePath,
  normalizeFill, fillToCss, fillToSvgDef, normalizeMask, maskToCss, hexToRgb,
} from '../primitives/geometry-p4.mjs';

const host = () => window.__readoxP3Host || window.__readoxFlyerP3Host;
const num = (v, p = 3) => { const n = Number(v); return Number.isFinite(n) ? +n.toFixed(p) : 0; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const NEW_TYPES = ['arc', 'sector', 'ring', 'polygon', 'star', 'path'];

// ─── Tracé d'une primitive dans son repère local (bbox w×h ou viewBox) ──────

function shapePath(it) {
  const rw = Math.round(it.w * 1000) / 1000, rh = Math.round(it.h * 1000) / 1000;
  if (it.type === 'path') return String(it.d || '');
  if (it.type === 'polygon') return pointsToPath(polygonPoints(rw, rh, it.sides ?? 5));
  if (it.type === 'star') return pointsToPath(starPoints(rw, rh, it.branches ?? 5, it.innerRatio ?? 0.45));
  const a = it.arc || {};
  return arcPath(rw, rh, a.from ?? 0, a.to ?? 270, { mode: it.type === 'arc' ? 'arc' : it.type, thickness: a.thickness ?? 0.35 });
}

/** SVG inline du rendu DOM d'une nouvelle primitive (viewBox local, étirable). */
function primitiveSvgDom(it, absolute = false) {
  const fill = normalizeFill(it);
  const d = shapePath(it);
  if (!d) return '';
  const dims = absolute ? `width="${num(it.w)}" height="${num(it.h)}"` : 'width="100%" height="100%"';
  const style = absolute ? '' : ' style="display:block;overflow:visible"';
  if (it.type === 'arc') {
    const sw = Math.max(2, Math.min(it.w, it.h) * ARC_STROKE_RATIO);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(it.w)} ${num(it.h)}" ${dims} preserveAspectRatio="none"${style}><path d="${esc(d)}" fill="none" stroke="${esc(fill.kind === 'solid' ? fill.color : fill.stops[0].color)}" stroke-width="${num(sw)}" stroke-linecap="round"/></svg>`;
  }
  const vb = it.type === 'path' && it.viewBox ? it.viewBox : { w: it.w, h: it.h };
  const sw = it.strokeWidth ? ` stroke="${esc(it.stroke || '#ffffff')}" stroke-width="${num(it.strokeWidth)}"${it.strokeLinecap ? ` stroke-linecap="${esc(it.strokeLinecap)}"` : ''}` : '';
  // Dégradé : on peint via un dégradé SVG local (un fond CSS ne suit pas le tracé).
  const gid = fill.kind !== 'solid' ? `p4f-${it.id}` : null;
  const defs = gid ? `<defs>${fillToSvgDef(fill, gid)}</defs>` : '';
  const fillAttr = gid ? `url(#${gid})` : fill.color;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(vb.w)} ${num(vb.h)}" ${dims} preserveAspectRatio="none"${style}>${defs}<path d="${esc(d)}" fill="${fillAttr}" fill-rule="evenodd"${sw}/></svg>`;
}

/**
 * SVG autonome à dimensions absolues d'une primitive P4 — utilisé par
 * l'adaptateur Fabric (gf011) pour un miroir fidèle à boîte englobante EXACTE
 * (w×h) : un drag sur la toile Fabric réécrit alors la géométrie sans perte.
 */
window.__readoxP4FabricSvg = function (it) {
  if (!NEW_TYPES.includes(it.type)) return null;
  return primitiveSvgDom(it, true);
};

/**
 * Remplissage structuré P4 → fabric.Gradient pour le miroir GF-01.1.
 * Même géométrie que fillToSvgDef (référence canonique d'export) : linéaire
 * angle 0° = est autour du centre ; radial = ellipse inscrite (r = w/2 avec
 * gradientTransform d'échelle h/w), équivalent au SVG r="0.5" objectBoundingBox.
 * Retourne null si le fill n'est pas un dégradé structuré (repli historique).
 */
window.__readoxP4FabricFill = function (fabric, rawFill, dims) {
  if (!rawFill || (rawFill.type !== 'linear' && rawFill.type !== 'radial') || !fabric?.Gradient) return null;
  const fill = normalizeFill({ fill: rawFill });
  if (fill.kind === 'solid') return null;
  const w = Math.max(1, Number(dims?.width) || 1), h = Math.max(1, Number(dims?.height) || 1);
  const colorStops = fill.stops.map(s => {
    const { r, g, b } = hexToRgb(s.color);
    return { offset: s.offset, color: `rgba(${r},${g},${b},${s.alpha})` };
  });
  if (fill.kind === 'radial') {
    return new fabric.Gradient({
      type: 'radial', gradientUnits: 'pixels',
      coords: { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: w / 2 },
      colorStops,
      gradientTransform: [1, 0, 0, h / w, 0, 0]
    });
  }
  const t = (normAngle(fill.angle) * Math.PI) / 180, c = Math.cos(t) / 2, s = Math.sin(t) / 2;
  return new fabric.Gradient({
    type: 'linear', gradientUnits: 'pixels',
    coords: { x1: w * (0.5 - c), y1: h * (0.5 - s), x2: w * (0.5 + c), y2: h * (0.5 + s) },
    colorStops
  });
};

function applyTextExtras(d, it) {
  if (it.letterSpacing) d.style.letterSpacing = `${it.letterSpacing}px`;
  if (it.lineHeight) d.style.lineHeight = String(it.lineHeight);
}

/** Ombre portée en CSS DOM (schéma canonique it.shadow, repli historique).
 * Produit la même chaîne que applyDecor (« dx px dy px blur px couleur »). */
window.__readoxP4ShadowCss = function (it) {
  if (!it.shadow) return '';
  const sh = typeof it.shadow === 'object' ? it.shadow : {};
  const dx = Number.isFinite(+sh.offsetX) ? +sh.offsetX : (Number(it.shadowOffset) || 3);
  const dy = Number.isFinite(+sh.offsetY) ? +sh.offsetY : (Number(it.shadowOffset) || 3);
  const bl = Number.isFinite(+sh.blur) ? +sh.blur : (Number(it.shadowBlur) || 6);
  return `${dx}px ${dy}px ${bl}px ${sh.color || '#0009'}`;
};

/**
 * Hook de rendu appelé par render() pour CHAQUE objet visible.
 * Retourne true si le contenu de la div a été entièrement produit ici
 * (nouvelles primitives, groupes) — les types historiques retournent false
 * après application des extensions de style (dégradé, masque, typo).
 */
window.__readoxP4ItemContent = function (d, it) {
  const mask = normalizeMask(it);
  if (mask) d.style.clipPath = maskToCss(mask, it.w, it.h);
  if (['text', 'textbox', 'richText', 'textOnPath'].includes(it.type)) { applyTextExtras(d, it); return false; }
  if (it.type === 'rect' || it.type === 'ellipse' || it.type === 'image') {
    const fill = normalizeFill(it);
    if (fill.kind !== 'solid' && it.type !== 'image') d.style.background = fillToCss(fill);
    // Rayon + ombre : appliqués ici pour atteindre AUSSI les enfants de groupe
    // (renderChildInto ne passe pas par applyDecor, limité aux objets racine).
    if (it.type === 'rect' && window.__readoxP4RectRadius) {
      const rr = window.__readoxP4RectRadius(it);
      if (rr > 0) d.style.borderRadius = rr + 'px';
    }
    if (it.shadow) d.style.boxShadow = window.__readoxP4ShadowCss(it);
    return false; // contenu historique (texte/image) produit par le socle
  }
  if (NEW_TYPES.includes(it.type)) {
    d.style.background = 'transparent';
    d.style.overflow = 'visible';
    d.innerHTML = primitiveSvgDom(it);
    return true;
  }
  if (it.type === 'group' && window.__readoxP4RenderGroup) {
    d.style.background = 'transparent';
    d.style.overflow = 'visible';
    d.style.transform = 'none'; // les enfants portent la rotation (coordonnées absolues recalculées)
    window.__readoxP4RenderGroup(d, it);
    return true;
  }
  return false;
};

// ─── Export SVG (hooks de svgDocument) ─────────────────────────────────────

/** Remplissage : pousse un <linearGradient>/<radialGradient> dans defs, retourne url(#…). */
window.__readoxP4SvgFill = function (it, defs) {
  const fill = normalizeFill(it);
  if (fill.kind === 'solid') return null;
  const gid = `p4g-${it.id}`;
  defs.push(fillToSvgDef(fill, gid));
  return `url(#${gid})`;
};

/** Masque : pousse un <clipPath> dans defs, retourne l'attribut clip-path. */
window.__readoxP4SvgClip = function (it, defs) {
  const mask = normalizeMask(it);
  if (!mask) return '';
  const cid = `p4c-${it.id}`;
  const body = mask.type === 'ellipse'
    ? `<ellipse cx="${num(it.x + it.w / 2)}" cy="${num(it.y + it.h / 2)}" rx="${num(it.w / 2)}" ry="${num(it.h / 2)}"/>`
    : mask.type === 'rect'
      ? `<rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}"/>`
      : `<rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" rx="${num(Math.min(mask.radius, Math.min(it.w, it.h) / 2))}"/>`;
  defs.push(`<clipPath id="${cid}">${body}</clipPath>`);
  return ` clip-path="url(#${cid})"`;
};

/** Ombre portée : pousse un <filter> feDropShadow dans defs, retourne l'attribut filter.
 * Schéma canonique unique it.shadow {offsetX,offsetY,blur,color} (repli historique
 * shadowOffset/shadowBlur conservé). Partagé par svgDocument (racine) et childSvg
 * (enfants de groupe) — une seule source de vérité, sortie identique au filtre
 * historique des textes racine (id sh-<id>, stdDeviation = blur/2). */
window.__readoxP4ShadowSvg = function (it, defs) {
  if (!it.shadow) return '';
  const sh = typeof it.shadow === 'object' ? it.shadow : {};
  const dx = Number.isFinite(+sh.offsetX) ? +sh.offsetX : (Number(it.shadowOffset) || 3);
  const dy = Number.isFinite(+sh.offsetY) ? +sh.offsetY : (Number(it.shadowOffset) || 3);
  const bl = Number.isFinite(+sh.blur) ? +sh.blur : (Number(it.shadowBlur) || 6);
  const colRaw = String(sh.color || '#00000099');
  const m8 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(colRaw);
  const fc = m8 ? '#' + m8[1] : colRaw, fo = m8 ? parseInt(m8[2], 16) / 255 : 1;
  const fid = `sh-${it.id}`;
  if (!defs.some(s => s.includes(`id="${fid}"`))) {
    defs.push(`<filter id="${esc(fid)}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${bl / 2}" flood-color="${esc(fc)}" flood-opacity="${fo}"/></filter>`);
  }
  return ` filter="url(#${fid})"`;
};

/** Rayon d'un rect (champ canonique radius, borné à la moitié du plus petit côté). */
window.__readoxP4RectRadius = function (it) {
  const r = Number(it.radius);
  return Number.isFinite(r) && r > 0 ? Math.min(r, Math.min(Number(it.w) || 0, Number(it.h) || 0) / 2) : 0;
};

/** Export d'une nouvelle primitive ou d'un groupe (null → placeholder historique). */
window.__readoxP4ItemSvg = function (it, defs) {
  if (it.type === 'group') {
    const inner = window.__readoxP4GroupChildrenSvg ? window.__readoxP4GroupChildrenSvg(it, defs) : '';
    return `<g data-id="${esc(it.id)}"${opacityAttr(it)}>${inner}</g>`;
  }
  if (!NEW_TYPES.includes(it.type)) return null;
  const d = shapePath(it);
  if (!d) return null;
  const fill = normalizeFill(it);
  let fillAttr;
  if (it.type === 'arc') {
    fillAttr = esc(fill.kind === 'solid' ? fill.color : fill.stops[0].color);
  } else if (fill.kind === 'solid') {
    fillAttr = esc(fill.color);
  } else {
    const gid = `p4g-${it.id}`;
    if (!defs.some(s => s.includes(`id="${gid}"`))) defs.push(fillToSvgDef(fill, gid));
    fillAttr = `url(#${gid})`;
  }
  const clip = window.__readoxP4SvgClip ? window.__readoxP4SvgClip(it, defs) : '';
  const angle = Number(it.rotation) || 0;
  const tr = angle ? ` rotate(${num(angle)} ${num(it.w / 2)} ${num(it.h / 2)})` : '';
  if (it.type === 'arc') {
    const sw = Math.max(2, Math.min(it.w, it.h) * ARC_STROKE_RATIO);
    return `<g transform="translate(${num(it.x)} ${num(it.y)})${tr}"${opacityAttr(it)}><path data-id="${esc(it.id)}" d="${esc(d)}" fill="none" stroke="${fillAttr}" stroke-width="${num(sw)}" stroke-linecap="round"${clip}/></g>`;
  }
  const vb = it.type === 'path' && it.viewBox ? it.viewBox : { w: it.w, h: it.h };
  const sc = (vb.w !== it.w || vb.h !== it.h) ? ` scale(${num(it.w / Math.max(1e-9, vb.w))} ${num(it.h / Math.max(1e-9, vb.h))})` : '';
  const sw = it.strokeWidth ? ` stroke="${esc(it.stroke || '#ffffff')}" stroke-width="${num(it.strokeWidth)}"${it.strokeLinecap ? ` stroke-linecap="${esc(it.strokeLinecap)}"` : ''}` : '';
  return `<g transform="translate(${num(it.x)} ${num(it.y)})${tr}${sc}"${opacityAttr(it)}><path data-id="${esc(it.id)}" d="${esc(d)}" fill="${fillAttr}" fill-rule="evenodd"${sw}${clip}/></g>`;
};
const opacityAttr = it => ` opacity="${num(Math.max(0, Math.min(1, (Number(it.opacity ?? 100)) / 100)))}"`;

// ─── Fabriques de primitives ────────────────────────────────────────────────

let uidC = 0;
const p4id = p => `${p}-${Date.now().toString(36)}${(uidC++).toString(36)}`;

const FACTORIES = {
  ellipse: () => ({ id: p4id('p4e'), type: 'ellipse', x: 60, y: 60, w: 100, h: 60, rotation: 0, opacity: 100, bg: '#0bb8ef', color: '#ffffff', size: 24, bold: false }),
  arc: () => ({ id: p4id('p4a'), type: 'arc', x: 330, y: 170, w: 190, h: 150, rotation: 0, opacity: 100, bg: '#f2a33c', color: '#ffffff', size: 24, bold: false, arc: { from: 200, to: 340, thickness: 0.35 } }),
  sector: () => ({ id: p4id('p4s'), type: 'sector', x: 60, y: 240, w: 120, h: 120, rotation: 0, opacity: 100, bg: '#7c5cd6', color: '#ffffff', size: 24, bold: false, arc: { from: 0, to: 270, thickness: 0.35 } }),
  ring: () => ({ id: p4id('p4r'), type: 'ring', x: 330, y: 360, w: 140, h: 140, rotation: 0, opacity: 100, bg: '#23b38a', color: '#ffffff', size: 24, bold: false, arc: { from: 0, to: 270, thickness: 0.3 } }),
  polygon: () => ({ id: p4id('p4p'), type: 'polygon', x: 200, y: 240, w: 110, h: 110, rotation: 0, opacity: 100, bg: '#d6455c', color: '#ffffff', size: 24, bold: false, sides: 5 }),
  star: () => ({ id: p4id('p4t'), type: 'star', x: 340, y: 40, w: 130, h: 120, rotation: 0, opacity: 100, bg: '#e8c547', color: '#ffffff', size: 24, bold: false, branches: 5, innerRatio: 0.45 }),
  path: () => ({
    id: p4id('p4b'), type: 'path', x: 60, y: 420, w: 220, h: 130, rotation: 0, opacity: 100, bg: '#3f9bff', color: '#ffffff', size: 24, bold: false,
    d: 'M 10 120 C 60 10 160 10 210 120 L 160 120 C 130 60 90 60 60 120 Z', viewBox: { w: 220, h: 130 },
  }),
};

function addPrimitive(kind) {
  const f = FACTORIES[kind];
  const h = host();
  if (!f || !h) return null;
  h.snapshot();
  const it = f();
  h.getTopLevel().push(it);
  window.select(it.id);
  h.render();
  return it.id;
}

// ─── Polices : détection de substitution par mesure (T27) ───────────────────

function fontAvailable(font) {
  const name = String(font || '').trim();
  if (!name) return true;
  const sel = document.getElementById('font');
  if (sel && [...sel.options].some(o => o.value === name || o.text === name)) return true; // police connue du sélecteur
  // document.fonts.check accepte les familles inconnues → mesure comparative.
  const c = document.createElement('canvas').getContext('2d');
  const probe = 'mmmmmmmmmmWWWWŒœ—';
  // Si la famille est absente, le navigateur replie sur le repli déclaré
  // (monospace) : mesures identiques → substitution détectée.
  c.font = `32px "${name}", monospace`;
  const w1 = c.measureText(probe).width;
  c.font = '32px monospace';
  const w2 = c.measureText(probe).width;
  return Math.abs(w1 - w2) > 0.5;
}

// ─── Panneau ────────────────────────────────────────────────────────────────

let panel = null;
const $p4 = sel => panel?.querySelector(sel);
const currentItem = () => {
  const h = host(); const id = h?.getSelected();
  return id ? h.getItems().find(v => v.id === id) : null;
};

function buildPanel() {
  const props = document.querySelector('.props');
  if (!props || document.getElementById('p4-panel')) return;
  panel = document.createElement('section');
  panel.id = 'p4-panel';
  panel.innerHTML = `
    <h2 style="margin:18px 0 8px;font-size:15px;color:#9fd0ff">Formes &amp; styles <small style="color:#5a7a9a;font-weight:400">P4</small></h2>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
      ${['ellipse', 'arc', 'sector', 'ring', 'polygon', 'star', 'path'].map(k =>
        `<button type="button" data-p4-add="${k}" style="font-size:11px;background:#0d2a47;color:#cfe8ff;border:1px solid #1f4a75;border-radius:6px;padding:4px 6px;cursor:pointer">${{ ellipse: 'Ellipse', arc: 'Arc', sector: 'Secteur', ring: 'Anneau', polygon: 'Polygone', star: 'Étoile', path: 'Tracé' }[k]}</button>`).join('')}
    </div>
    <div id="p4-sec-fill" style="border-top:1px solid #16324e;padding-top:6px;margin-top:6px">
      <label style="color:#9fb8d0;font-size:11px"><input type="checkbox" id="p4-fill-enabled"> Dégradé</label>
      <select id="p4-fill-type" style="background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;font-size:11px"><option value="linear">Linéaire</option><option value="radial">Radial</option></select>
      <label style="color:#9fb8d0;font-size:11px">Angle <input id="p4-fill-angle" type="number" step="5" style="width:56px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px">°</label>
      <div id="p4-stops" style="margin-top:4px"></div>
      <button type="button" id="p4-stop-add" style="font-size:11px;background:#0d2a47;color:#cfe8ff;border:1px solid #1f4a75;border-radius:6px;padding:3px 6px;cursor:pointer;margin-top:4px">+ Stop</button>
    </div>
    <div id="p4-sec-mask" style="border-top:1px solid #16324e;padding-top:6px;margin-top:6px">
      <label style="color:#9fb8d0;font-size:11px">Masque
        <select id="p4-mask" style="background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;font-size:11px"><option value="">Aucun</option><option value="ellipse">Ellipse</option><option value="roundedRect">Rectangle arrondi</option><option value="rect">Rectangle</option></select>
      </label>
      <label style="color:#9fb8d0;font-size:11px">Rayon <input id="p4-mask-radius" type="number" min="0" style="width:56px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px"></label>
    </div>
    <div id="p4-sec-arc" style="border-top:1px solid #16324e;padding-top:6px;margin-top:6px">
      <span style="color:#9fb8d0;font-size:11px">Arc </span>
      <label style="color:#9fb8d0;font-size:11px">de <input id="p4-arc-from" type="number" step="5" style="width:56px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px">°</label>
      <label style="color:#9fb8d0;font-size:11px">à <input id="p4-arc-to" type="number" step="5" style="width:56px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px">°</label>
      <label style="color:#9fb8d0;font-size:11px">épaisseur <input id="p4-arc-thickness" type="number" step="0.05" min="0.05" max="0.95" style="width:56px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px"></label>
    </div>
    <div id="p4-sec-typo" style="border-top:1px solid #16324e;padding-top:6px;margin-top:6px">
      <label style="color:#9fb8d0;font-size:11px">Crénage <input id="p4-tracking" type="number" step="0.5" style="width:60px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px"> px</label>
      <label style="color:#9fb8d0;font-size:11px;margin-left:6px">Interligne <input id="p4-leading" type="number" step="0.05" min="0.5" max="3" style="width:60px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px"></label>
      <div style="margin-top:4px"><label style="color:#9fb8d0;font-size:11px">Police <input id="p4-font" type="text" style="width:130px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px"></label></div>
      <p id="p4-font-warning" style="display:none;color:#ffb454;font-size:10px;margin:4px 0 0"></p>
    </div>
    <div style="border-top:1px solid #16324e;padding-top:6px;margin-top:6px">
      <button type="button" id="p4-edit-points" style="font-size:11px;background:#0d2a47;color:#cfe8ff;border:1px solid #1f4a75;border-radius:6px;padding:4px 8px;cursor:pointer">Éditer les points</button>
    </div>`;
  props.appendChild(panel);

  panel.querySelectorAll('[data-p4-add]').forEach(b => b.addEventListener('click', () => addPrimitive(b.dataset.p4Add)));

  // ── Dégradé ──
  $p4('#p4-fill-enabled').addEventListener('change', e => {
    const it = currentItem(); if (!it) return;
    host().snapshot();
    if (e.target.checked) it.fill = { type: $p4('#p4-fill-type').value, angle: 90, stops: [{ offset: 0, color: it.bg || '#0bb8ef', alpha: 1 }, { offset: 1, color: '#031326', alpha: 1 }] };
    else delete it.fill;
    host().render(); syncPanel();
  });
  $p4('#p4-fill-type').addEventListener('change', e => {
    const it = currentItem(); if (!it?.fill) return;
    host().snapshot(); it.fill.type = e.target.value; host().render(); syncPanel();
  });
  $p4('#p4-fill-angle').addEventListener('change', e => {
    const it = currentItem(); if (!it?.fill) return;
    host().snapshot(); it.fill.angle = Number(e.target.value) || 0; host().render(); syncPanel();
  });
  $p4('#p4-stop-add').addEventListener('click', () => {
    const it = currentItem(); if (!it?.fill) return;
    host().snapshot(); it.fill.stops.push({ offset: 0.5, color: '#ffffff', alpha: 1 }); host().render(); syncPanel();
  });

  // ── Masque ──
  $p4('#p4-mask').addEventListener('change', e => {
    const it = currentItem(); if (!it) return;
    host().snapshot();
    if (!e.target.value) delete it.mask;
    else it.mask = { type: e.target.value, radius: Number($p4('#p4-mask-radius').value) || 12 };
    host().render(); syncPanel();
  });
  $p4('#p4-mask-radius').addEventListener('change', e => {
    const it = currentItem(); if (!it?.mask || it.mask.type !== 'roundedRect') return;
    host().snapshot(); it.mask.radius = Math.max(0, Number(e.target.value) || 0); host().render(); syncPanel();
  });

  // ── Arc / anneau / secteur ──
  const setArc = key => e => {
    const it = currentItem(); if (!it || !['arc', 'sector', 'ring'].includes(it.type)) return;
    host().snapshot();
    it.arc = { ...(it.arc || {}), [key]: Number(e.target.value) };
    if (!Number.isFinite(it.arc[key])) delete it.arc[key];
    host().render(); syncPanel();
  };
  $p4('#p4-arc-from').addEventListener('change', setArc('from'));
  $p4('#p4-arc-to').addEventListener('change', setArc('to'));
  $p4('#p4-arc-thickness').addEventListener('change', setArc('thickness'));

  // ── Typographie ──
  const setTextProp = (key, value) => {
    const it = currentItem(); if (!it) return;
    host().snapshot();
    if (value) it[key] = value; else delete it[key];
    host().render(); syncPanel();
  };
  $p4('#p4-tracking').addEventListener('change', e => setTextProp('letterSpacing', Number(e.target.value) || 0));
  $p4('#p4-leading').addEventListener('change', e => setTextProp('lineHeight', Number(e.target.value) || 0));
  $p4('#p4-font').addEventListener('change', e => {
    const it = currentItem(); if (!it) return;
    host().snapshot();
    if (e.target.value.trim()) it.font = e.target.value.trim(); else delete it.font;
    host().render(); syncPanel();
  });

  $p4('#p4-edit-points').addEventListener('click', () => {
    const it = currentItem();
    if (pointEdit) exitPointEdit(true);
    else if (it?.type === 'path') enterPointEdit(it);
  });
}

/** Repeint les champs du panneau d'après l'objet sélectionné (lecture seule). */
function syncPanel() {
  if (!panel) return;
  const it = currentItem();
  const has = !!it;
  const isArc = has && ['arc', 'sector', 'ring'].includes(it.type);
  const isPath = has && it.type === 'path';
  const isText = has && ['text', 'textbox', 'richText', 'textOnPath'].includes(it.type);
  $p4('#p4-sec-arc').style.display = isArc ? '' : 'none';
  $p4('#p4-sec-typo').style.display = isText ? '' : 'none';
  $p4('#p4-edit-points').style.display = isPath ? '' : 'none';
  $p4('#p4-edit-points').textContent = pointEdit ? 'Terminer les points' : 'Éditer les points';
  const fillable = has && !['group'].includes(it.type);
  $p4('#p4-sec-fill').style.display = fillable ? '' : 'none';
  $p4('#p4-sec-mask').style.display = has && it.type !== 'group' ? '' : 'none';
  if (!has) return;
  $p4('#p4-fill-enabled').checked = !!it.fill;
  $p4('#p4-fill-type').value = it.fill?.type || 'linear';
  $p4('#p4-fill-angle').value = it.fill?.angle ?? 90;
  if (isArc) {
    $p4('#p4-arc-from').value = it.arc?.from ?? 0;
    $p4('#p4-arc-to').value = it.arc?.to ?? 270;
    $p4('#p4-arc-thickness').value = it.arc?.thickness ?? 0.35;
  }
  if (isText) {
    $p4('#p4-tracking').value = it.letterSpacing ?? 0;
    $p4('#p4-leading').value = it.lineHeight ?? 1.16;
    $p4('#p4-font').value = it.font || '';
    const w = $p4('#p4-font-warning');
    if (it.font && !fontAvailable(it.font)) {
      w.style.display = '';
      w.textContent = `Police « ${it.font} » indisponible : substitution par une police de repli (export concerné).`;
    } else w.style.display = 'none';
  }
  $p4('#p4-mask').value = it.mask?.type || '';
  $p4('#p4-mask-radius').value = it.mask?.radius ?? 12;
  // Stops du dégradé
  const stopsEl = $p4('#p4-stops');
  stopsEl.replaceChildren();
  if (it.fill && typeof it.fill === 'object' && Array.isArray(it.fill.stops)) {
    it.fill.stops.forEach((s, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:3px';
      row.innerHTML = `<input type="number" class="p4-stop-offset" min="0" max="1" step="0.05" value="${s.offset}" style="width:52px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px">
        <input type="color" class="p4-stop-color" value="${s.color.length === 7 ? s.color : '#000000'}" style="width:30px;height:22px;border:none;background:none;padding:0">
        <input type="number" class="p4-stop-alpha" min="0" max="1" step="0.1" value="${s.alpha}" title="alpha" style="width:52px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:5px;padding:2px 4px">
        <button type="button" class="p4-stop-del" style="font-size:10px;background:#3a1522;color:#ffb0b0;border:1px solid #5c2432;border-radius:5px;padding:2px 5px;cursor:pointer">×</button>`;
      row.querySelector('.p4-stop-offset').addEventListener('change', e => { host().snapshot(); s.offset = Number(e.target.value) || 0; host().render(); syncPanel(); });
      row.querySelector('.p4-stop-color').addEventListener('change', e => { host().snapshot(); s.color = e.target.value; host().render(); syncPanel(); });
      row.querySelector('.p4-stop-alpha').addEventListener('change', e => { host().snapshot(); s.alpha = Math.min(1, Math.max(0, Number(e.target.value) || 0)); host().render(); syncPanel(); });
      row.querySelector('.p4-stop-del').addEventListener('click', () => { if (it.fill.stops.length <= 2) return; host().snapshot(); it.fill.stops.splice(i, 1); host().render(); syncPanel(); });
      stopsEl.appendChild(row);
    });
  }
}

// ─── Édition de points (T24) ────────────────────────────────────────────────

let pointEdit = null; // { itemId, anchors:[div] }

function pathScale(it) {
  const vb = it.viewBox || { w: it.w, h: it.h };
  return { sx: it.w / Math.max(1e-9, vb.w), sy: it.h / Math.max(1e-9, vb.h), vb };
}

/** Points éditables du tracé : ancres (M/L/fin de courbe) et poignées de contrôle. */
function editablePoints(segs) {
  const pts = [];
  for (const s of segs) {
    if (s.cmd === 'Z') continue;
    if (s.cmd === 'C') { pts.push({ x: s.x1, y: s.y1, ctrl: true }, { x: s.x2, y: s.y2, ctrl: true }, { x: s.x, y: s.y, ctrl: false }); }
    else if (s.cmd === 'Q') { pts.push({ x: s.x1, y: s.y1, ctrl: true }, { x: s.x, y: s.y, ctrl: false }); }
    else pts.push({ x: s.x, y: s.y, ctrl: false });
  }
  return pts;
}

function pageScale() {
  const page = document.getElementById('page');
  return page ? page.getBoundingClientRect().width / (window.ReadoxDocumentGeometry?.width || 510) : 1;
}

function enterPointEdit(it) {
  exitPointEdit(true);
  let segs;
  try { segs = parsePathD(it.d); } catch { return; }
  pointEdit = { itemId: it.id, anchors: [] };
  const page = document.getElementById('page');
  const pts = editablePoints(segs);
  pts.forEach((pt, index) => {
    if (pt.ctrl) return; // les poignées de contrôle restent réservées à un lot ultérieur
    const a = document.createElement('div');
    a.className = 'p4-anchor';
    a.style.cssText = 'position:absolute;width:12px;height:12px;background:#fff;border:2px solid #b45cff;border-radius:50%;transform:translate(-50%,-50%);z-index:60001;cursor:move;touch-action:none;box-shadow:0 1px 5px #0008';
    a.dataset.index = index;
    page.appendChild(a);
    a.addEventListener('pointerdown', ev => startPointDrag(ev, index));
    pointEdit.anchors.push(a);
  });
  refreshPointHandles();
  syncPanel();
}

function refreshPointHandles() {
  if (!pointEdit) return;
  const h = host();
  const it = h?.getItems().find(v => v.id === pointEdit.itemId);
  if (!it || it.type !== 'path') { exitPointEdit(true); return; }
  let segs;
  try { segs = parsePathD(it.d); } catch { exitPointEdit(true); return; }
  const pts = editablePoints(segs);
  const { sx, sy } = pathScale(it);
  // Les ancres vivent dans #page (position relative) : coordonnées page relatives.
  for (const a of pointEdit.anchors) {
    const pt = pts[Number(a.dataset.index)];
    if (!pt) continue;
    a.style.left = `${(it.x + pt.x * sx)}px`;
    a.style.top = `${(it.y + pt.y * sy)}px`;
  }
}

function startPointDrag(ev, index) {
  if (!pointEdit || ev.button !== 0) return;
  ev.preventDefault(); ev.stopPropagation();
  const h = host();
  const it = h?.getItems().find(v => v.id === pointEdit.itemId);
  if (!it) return;
  h.snapshot(); // une transaction undo par geste
  const sc = pageScale();
  const { sx, sy } = pathScale(it);
  const a = ev.currentTarget;
  a.setPointerCapture(ev.pointerId);
  let moved = false, lastX = ev.clientX, lastY = ev.clientY;
  const cancel = ev2 => {
    if (ev2.key !== 'Escape') return;
    try { const segs = parsePathD(it.d); it.d = buildPathD(movePathPoint(segs, index, 0, 0)); } catch { /* noop */ }
    h.undoQuiet(); // annule le snapshot du geste
    h.render(); refreshPointHandles();
    moved = false; a.onpointermove = null; a.onpointerup = null;
    window.removeEventListener('keydown', cancel, true);
  };
  window.addEventListener('keydown', cancel, true);
  a.onpointermove = ev2 => {
    if (!a.hasPointerCapture(ev2.pointerId)) return;
    const dxScreen = ev2.clientX - lastX, dyScreen = ev2.clientY - lastY;
    lastX = ev2.clientX; lastY = ev2.clientY;
    if (!dxScreen && !dyScreen) return;
    moved = true;
    try {
      const segs = parsePathD(it.d);
      it.d = buildPathD(movePathPoint(segs, index, (dxScreen / sc) / sx, (dyScreen / sc) / sy));
    } catch { return; }
    h.render(); refreshPointHandles();
  };
  a.onpointerup = () => {
    a.onpointermove = null; a.onpointerup = null;
    window.removeEventListener('keydown', cancel, true);
    if (!moved) { h.undoQuiet(); return; } // geste vide : aucune transaction
    // Recalage de la bbox : le tracé est normalisé dans un viewBox ajusté.
    try {
      const segs = parsePathD(it.d);
      const b = pathBounds(segs);
      if (b && b.w > 0 && b.h > 0) {
        const { sx: sx2, sy: sy2, vb } = pathScale(it);
        it.x = num(it.x + b.x * sx2); it.y = num(it.y + b.y * sy2);
        it.w = num(Math.max(1, b.w * sx2)); it.h = num(Math.max(1, b.h * sy2));
        it.d = buildPathD(translatePath(segs, -b.x, -b.y));
        it.viewBox = { w: num(b.w), h: num(b.h) };
      }
    } catch { /* tracé inchangé */ }
    h.render(); refreshPointHandles();
  };
}

function exitPointEdit(silent = false) {
  if (!pointEdit) return;
  pointEdit.anchors.forEach(a => a.remove());
  pointEdit = null;
  if (!silent) syncPanel();
}

// ─── Installation ───────────────────────────────────────────────────────────

function install() {
  const h = host();
  if (!h || !document.querySelector('.props') || !document.getElementById('page')) return false;
  buildPanel();
  // Enrobage du rendu : panneau + ancres suivent la scène.
  const prevRender = window.render;
  if (typeof prevRender === 'function' && !window.__readoxP4RenderWrapped) {
    window.__readoxP4RenderWrapped = true;
    window.render = function (...a) { const r = prevRender(...a); syncPanel(); refreshPointHandles(); return r; };
  }
  const prevSelect = window.select;
  if (typeof prevSelect === 'function' && !window.__readoxP4SelectWrapped) {
    window.__readoxP4SelectWrapped = true;
    window.select = function (id) { exitPointEdit(true); return prevSelect(id); };
  }
  window.ReadoxP4 = {
    version: '4.0.0',
    addPrimitive,
    shapePath: it => shapePath(it),
    fontAvailable,
    primitives: [...NEW_TYPES, 'ellipse'],
  };
  h.render();
  return true;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install());
else install();
