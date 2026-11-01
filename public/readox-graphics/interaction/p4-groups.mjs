/**
 * p4-groups.mjs — Phase 4 : groupes, panneau Calques, assets, préflight export.
 * T30 : visibilité, verrouillage, ordre, groupes (transformations globales,
 *       sous-sélection, dissociation en une transaction).
 * T29 : hash SHA-256, licence et provenance des assets ; export bloqué si un
 *       asset est manquant.
 *
 * Modèle de groupe : un groupe est un objet {type:'group', x,y,w,h,rotation,
 * opacity, children:[…]} vivant dans le tableau racine `items`. Les enfants
 * conservent des coordonnées PAGE ABSOLUES ; `_base` mémorise la boîte du
 * groupe correspondant à leurs positions courantes. syncGroupBaselines(),
 * appelé avant chaque rendu et avant toute capture/export, propage le delta
 * groupe→enfants (translation puis homothétie puis rotation) quand la boîte
 * du groupe a été modifiée, et recalcule la boîte enfant→groupe (unionBounds)
 * quand un enfant a bougé.
 *
 * Contrat du pont : getTopLevel() = tableau racine vivant (écriture) ;
 * getItems() = même tableau si aucun groupe, sinon vue aplatie (lecture,
 * références vivantes — utilisée par p3-interactions et p4-primitives).
 */
import { num, unionBounds, applyGroupDelta } from '../primitives/geometry-p4.mjs';

const host = () => window.__readoxP3Host || window.__readoxFlyerP3Host;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const IMAGE_TYPES = ['image', 'imageFrame', 'backgroundImage', 'patternImage', 'imageBackground'];
const TEXT_TYPES = ['text', 'textbox', 'richText', 'textOnPath'];

// Capturé AVANT l'enrobage de getItems : renvoie le tableau racine vivant.
let topLevelGetItems = null;

// ─── Arbre de scène ─────────────────────────────────────────────────────────

/** Vue aplatie (lecture) : racine puis descendants, références vivantes. */
function flatten(list, out = []) {
  // Contrat legacy : sans groupe, retourner le tableau racine LUI-MÊME
  // (des consommateurs historiques le mutent directement : length=0, push…).
  if (out.length === 0 && !list.some(it => it.type === 'group' && Array.isArray(it.children))) return list;
  for (const it of list) {
    out.push(it);
    if (it.type === 'group' && Array.isArray(it.children)) flatten(it.children, out);
  }
  return out;
}

/** Localise un objet par id : { array, index, group } — group = groupe parent ou null. */
function locate(id, list = null, group = null) {
  const root = list || (topLevelGetItems ? topLevelGetItems() : []);
  for (let i = 0; i < root.length; i++) {
    const it = root[i];
    if (it.id === id) return { array: root, index: i, group };
    if (it.type === 'group' && Array.isArray(it.children)) {
      const r = locate(id, it.children, it);
      if (r) return r;
    }
  }
  return null;
}

// ─── Synchronisation des boîtes de groupe ───────────────────────────────────

const TOL = 0.02;

function syncOneGroup(g) {
  if (!Array.isArray(g.children) || !g.children.length) return;
  if (!g._base) {
    const u = unionBounds(g.children);
    if (u) { g.x = num(u.x); g.y = num(u.y); g.w = num(u.w); g.h = num(u.h); }
    g._base = { x: g.x, y: g.y, w: g.w, h: g.h, rotation: Number(g.rotation) || 0 };
    return;
  }
  const b = g._base;
  const groupMoved = Math.abs(g.x - b.x) > TOL || Math.abs(g.y - b.y) > TOL
    || Math.abs(g.w - b.w) > TOL || Math.abs(g.h - b.h) > TOL
    || Math.abs((Number(g.rotation) || 0) - b.rotation) > 0.001;
  if (groupMoved) {
    // La boîte du groupe a été transformée : propager le delta aux enfants.
    applyGroupDelta(g.children, {
      dx: g.x - b.x, dy: g.y - b.y,
      sx: b.w > 0 ? g.w / b.w : 1, sy: b.h > 0 ? g.h / b.h : 1,
      drot: (Number(g.rotation) || 0) - b.rotation,
      origin: { x: b.x, y: b.y },
      center: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
    });
    g._base = { x: g.x, y: g.y, w: g.w, h: g.h, rotation: Number(g.rotation) || 0 };
    return;
  }
  // Sinon, un enfant a pu bouger (sous-sélection) : recalage de la boîte.
  const u = unionBounds(g.children);
  if (u && (Math.abs(u.x - g.x) > TOL || Math.abs(u.y - g.y) > TOL
    || Math.abs(u.w - g.w) > TOL || Math.abs(u.h - g.h) > TOL)) {
    g.x = num(u.x); g.y = num(u.y); g.w = num(u.w); g.h = num(u.h);
    g._base = { x: g.x, y: g.y, w: g.w, h: g.h, rotation: Number(g.rotation) || 0 };
  }
}

/** À appeler avant chaque rendu et chaque capture/export. */
function syncGroupBaselines() {
  if (!topLevelGetItems) return;
  for (const g of topLevelGetItems()) {
    if (g && g.type === 'group') syncOneGroup(g);
  }
}

// ─── Rendu DOM des groupes ──────────────────────────────────────────────────

const selectedId = () => host()?.getSelected();

/** Rend un enfant de groupe dans `parent` (coordonnées relatives à la boîte du groupe). */
function renderChildInto(parent, child, group) {
  const d = document.createElement('div');
  d.className = 'element' + (child.id === selectedId() ? ' selected' : '');
  d.dataset.id = child.id;
  Object.assign(d.style, {
    position: 'absolute',
    left: num(child.x - group.x) + 'px',
    top: num(child.y - group.y) + 'px',
    width: child.w + 'px',
    height: child.h + 'px',
    opacity: (Number(child.opacity ?? 100)) / 100,
    transform: `rotate(${Number(child.rotation) || 0}deg)`,
    transformOrigin: 'center center',
    background: (child.type === 'rect' || child.type === 'ellipse') ? (child.bg || '#ffffff') : 'transparent',
    borderRadius: child.type === 'ellipse' ? '50%' : '0',
    color: child.color,
    fontSize: (child.size || 24) + 'px',
    fontWeight: child.bold ? '800' : '400',
    fontFamily: child.font || 'Arial',
    fontStyle: child.italic ? 'italic' : 'normal',
    lineHeight: '1.16',
    whiteSpace: 'pre-wrap',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: child.type === 'rect' ? 'center' : 'flex-start',
    overflow: TEXT_TYPES.includes(child.type) ? 'visible' : 'hidden',
    overflowWrap: TEXT_TYPES.includes(child.type) ? 'break-word' : 'normal',
    cursor: 'move',
    userSelect: 'none',
  });
  const handled = window.__readoxP4ItemContent ? window.__readoxP4ItemContent(d, child) : false;
  if (!handled) {
    if (IMAGE_TYPES.includes(child.type) && child.src) {
      const im = document.createElement('img');
      im.src = child.src;
      im.style.cssText = (typeof window.__readoxP3CropCssText === 'function' && child.crop)
        ? window.__readoxP3CropCssText(child)
        : 'width:100%;height:100%;object-fit:' + (child.objectFit || 'cover');
      im.draggable = false;
      d.appendChild(im);
    } else if (TEXT_TYPES.includes(child.type)) {
      d.textContent = child.text ?? '';
    }
  }
  parent.appendChild(d);
  return d;
}

/** Hook appelé par __readoxP4ItemContent pour remplir la div d'un groupe. */
window.__readoxP4RenderGroup = function (d, group) {
  d.replaceChildren();
  for (const child of (group.children || [])) {
    if (child.hidden) continue;
    renderChildInto(d, child, group);
  }
};

// ─── Export SVG des groupes ─────────────────────────────────────────────────

/** Sérialise un enfant de groupe en SVG absolu (miroir des branches de svgDocument). */
function childSvg(it, defs) {
  const x = Number(it.x), y = Number(it.y), w = Number(it.w), h = Number(it.h);
  if (![x, y, w, h].every(Number.isFinite)) return '';
  const p4fill = window.__readoxP4SvgFill ? window.__readoxP4SvgFill(it, defs) : null;
  const p4clip = window.__readoxP4SvgClip ? window.__readoxP4SvgClip(it, defs) : '';
  const p4sh = window.__readoxP4ShadowSvg ? window.__readoxP4ShadowSvg(it, defs) : '';
  const angle = Number(it.rotation) || 0;
  const tr = angle ? ` transform="rotate(${angle} ${num(x + w / 2)} ${num(y + h / 2)})"` : '';
  const opacity = ` opacity="${num(Math.max(0, Math.min(1, (Number(it.opacity ?? 100)) / 100)))}"`;
  if (it.type === 'ellipse') {
    return `<ellipse cx="${num(x + w / 2)}" cy="${num(y + h / 2)}" rx="${num(w / 2)}" ry="${num(h / 2)}" fill="${p4fill || esc(it.bg || '#ffffff')}"${opacity}${tr}${p4clip}${p4sh}/>`;
  }
  if (it.type === 'rect') {
    const rr = window.__readoxP4RectRadius ? window.__readoxP4RectRadius(it) : 0;
    return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${rr ? ` rx="${num(rr)}" ry="${num(rr)}"` : ''} fill="${p4fill || esc(it.bg || '#ffffff')}"${opacity}${tr}${p4clip}${p4sh}/>`;
  }
  if (IMAGE_TYPES.includes(it.type) && it.src) {
    if (it.crop && (it.crop.l || it.crop.t || it.crop.r || it.crop.b)) {
      const c = it.crop, iw = w / Math.max(0.01, 1 - (+c.l || 0) - (+c.r || 0)), ih = h / Math.max(0.01, 1 - (+c.t || 0) - (+c.b || 0));
      return `<svg x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" overflow="hidden"${opacity}${tr}${p4clip}${p4sh}><image x="${num(-(+c.l || 0) * iw)}" y="${num(-(+c.t || 0) * ih)}" width="${num(iw)}" height="${num(ih)}" preserveAspectRatio="none" href="${esc(it.src)}"/></svg>`;
    }
    return `<image x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" preserveAspectRatio="xMidYMid slice" href="${esc(it.src)}"${opacity}${tr}${p4clip}${p4sh}/>`;
  }
  if (TEXT_TYPES.includes(it.type)) {
    const size = Number(it.size) || 24, lines = String(it.text ?? '').split(/\r?\n/);
    let s = `<text x="${num(x)}" y="${num(y + size)}" font-family="${esc(it.font || 'Arial')}" font-size="${size}" font-style="${it.italic ? 'italic' : 'normal'}" font-weight="${it.bold ? 'bold' : 'normal'}"${it.letterSpacing ? ` letter-spacing="${Number(it.letterSpacing)}px"` : ''} fill="${esc(it.color || '#111111')}"${opacity}${tr}${p4sh}>`;
    lines.forEach((line, index) => { s += `<tspan x="${num(x)}" dy="${index ? (it.lineHeight || '1.05') + 'em' : '0'}">${esc(line)}</tspan>`; });
    return s + '</text>';
  }
  // Primitives P4 et sous-groupes : hook dédié (récursif pour les groupes).
  const s4 = window.__readoxP4ItemSvg ? window.__readoxP4ItemSvg(it, defs) : null;
  return s4 || '';
}

/** Hook appelé par __readoxP4ItemSvg pour exporter les enfants d'un groupe. */
window.__readoxP4GroupChildrenSvg = function (group, defs) {
  let out = '';
  for (const child of (group.children || [])) {
    if (child.hidden) continue;
    out += childSvg(child, defs);
  }
  return out;
};

// ─── Groupement / dissociation (T30) ────────────────────────────────────────

/** Groupe les objets racine désignés (une seule transaction d'historique). */
function groupSelection(ids) {
  const h = host();
  const root = topLevelGetItems ? topLevelGetItems() : [];
  const members = root.filter(it => ids.includes(it.id));
  if (members.length < 2) return null;
  h.snapshot();
  const u = unionBounds(members);
  const firstIndex = Math.min(...members.map(m => root.indexOf(m)));
  const group = {
    id: 'p4g-' + Math.random().toString(36).slice(2, 8),
    type: 'group',
    x: num(u.x), y: num(u.y), w: num(u.w), h: num(u.h),
    rotation: 0, opacity: 100,
    children: members,
    _base: { x: num(u.x), y: num(u.y), w: num(u.w), h: num(u.h), rotation: 0 },
  };
  const idxs = members.map(m => root.indexOf(m)).sort((a, b) => b - a);
  for (const i of idxs) root.splice(i, 1);
  root.splice(Math.min(firstIndex, root.length), 0, group);
  window.select(group.id);
  h.render();
  return group;
}

/** Dissocie un groupe racine : les sous-objets reprennent leur existence (1 transaction). */
function ungroup(id) {
  const h = host();
  const root = topLevelGetItems ? topLevelGetItems() : [];
  const i = root.findIndex(v => v.id === id && v.type === 'group');
  if (i < 0) return false;
  h.snapshot();
  const children = root[i].children || [];
  root.splice(i, 1, ...children);
  window.select(children[0]?.id ?? null);
  h.render();
  return true;
}

// ─── Sous-sélection (double-clic) ───────────────────────────────────────────
// La multi-sélection Maj+clic existe déjà dans le socle (flyer-7g,
// window.__flyer7gSelection) : P4 la consomme, sans état concurrent.

function installPointerHooks() {
  const page = document.getElementById('page');
  if (!page) return;
  // Double-clic sur un enfant de groupe : sous-sélection de l'enfant.
  const sousSelectionA = (clientX, clientY, e) => {
    let el = e.target.closest?.('.element');
    let id = el?.dataset.id;
    if (!id) {
      // Le canvas Fabric recouvre les divs legacy : hit-test géométrique.
      const pr = page.getBoundingClientRect();
      const sc = pr.width / (window.ReadoxDocumentGeometry?.width || 510);
      const px = (clientX - pr.left) / sc, py = (clientY - pr.top) / sc;
      const root = topLevelGetItems ? topLevelGetItems() : [];
      for (const g of [...root].reverse()) {
        if (g.type !== 'group' || !Array.isArray(g.children)) continue;
        // BG-L9 (D29) : un ornement (voile, liseré, ruban — decorative:true)
        // ne capture la sous-sélection que si aucun enfant de contenu ne
        // contient le point ; sinon les photos des cartes, recouvertes de
        // leur voile et de leur liseré, ne seraient jamais atteignables.
        let ornement = null;
        for (const c of [...g.children].reverse()) {
          if (c.hidden) continue;
          if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
            if (c.decorative) { if (!ornement) ornement = c.id; continue; }
            id = c.id; break;
          }
        }
        if (!id && ornement) id = ornement;
        if (id) break;
      }
      if (!id) return;
    }
    const loc = locate(id);
    if (loc && loc.group) {
      e.preventDefault(); e.stopPropagation();
      window.select(id);
      host()?.render();
    }
  };
  page.addEventListener('dblclick', e => sousSelectionA(e.clientX, e.clientY, e), true);
  // BG-L9 (D28) : au tactile, Chromium n'émet jamais de dblclick — la
  // sous-sélection §198 serait impossible sur mobile. Deux touchstart
  // rapprochés (< 400 ms, < 30 px) déclenchent le MÊME mécanisme.
  // BG-L9 (D33) : le listener est sur document (capture) — l'overlay des
  // poignées P3 est monté HORS de #page ; sur un petit objet, le second tap
  // frappe la poignée qui recouvre le centre, et le hit-test géométrique
  // (déjà basé sur les coordonnées écran) reste exact.
  let dernierTap = null;
  document.addEventListener('touchend', e => {
    const t = e.changedTouches?.[0];
    if (!t) { dernierTap = null; return; }
    const pr = page.getBoundingClientRect();
    if (t.clientX < pr.left || t.clientX > pr.right || t.clientY < pr.top || t.clientY > pr.bottom) { dernierTap = null; return; }
    const maintenant = performance.now();
    const avant = dernierTap;
    dernierTap = { x: t.clientX, y: t.clientY, t: maintenant };
    if (!avant || maintenant - avant.t > 400) return;
    if (Math.hypot(t.clientX - avant.x, t.clientY - avant.y) > 30) return;
    dernierTap = null;
    sousSelectionA(t.clientX, t.clientY, e);
  }, true);
}

// ─── Panneau Calques ────────────────────────────────────────────────────────

let layersPanel = null;

function labelOf(it) {
  // BG-L2 (cahier BG-COMP-1.0 §3) : un nom humain explicite prime sur le type.
  if (typeof it.name === 'string' && it.name.trim()) return `${it.name.trim()}  ·${String(it.id).slice(-4)}`;
  const names = {
    text: 'Texte', rect: 'Rectangle', ellipse: 'Ellipse', image: 'Image',
    arc: 'Arc', sector: 'Secteur', ring: 'Anneau', polygon: 'Polygone',
    star: 'Étoile', path: 'Tracé', group: 'Groupe',
  };
  const base = names[it.type] || it.type;
  const txt = TEXT_TYPES.includes(it.type) && it.text ? ` — ${String(it.text).slice(0, 14)}` : '';
  return `${base}${txt}  ·${String(it.id).slice(-4)}`;
}

function buildLayersPanel() {
  const props = document.querySelector('.props');
  if (!props || document.getElementById('p4-layers')) return;
  layersPanel = document.createElement('section');
  layersPanel.id = 'p4-layers';
  layersPanel.innerHTML = `
    <h2 style="margin:18px 0 8px;font-size:15px;color:#9fd0ff">Calques <small style="color:#5a7a9a;font-weight:400">P4</small></h2>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <button type="button" id="p4-group" style="flex:1;font-size:11px;background:#0d2a47;color:#cfe8ff;border:1px solid #1f4a75;border-radius:6px;padding:4px 6px;cursor:pointer">Grouper</button>
      <button type="button" id="p4-ungroup" style="flex:1;font-size:11px;background:#0d2a47;color:#cfe8ff;border:1px solid #1f4a75;border-radius:6px;padding:4px 6px;cursor:pointer">Dissocier</button>
    </div>
    <div id="p4-layers-list" style="display:flex;flex-direction:column;gap:2px"></div>
    <p class="hint" style="margin:6px 0 0;font-size:10px">Maj+clic : multi-sélection · Double-clic : sous-sélection dans un groupe</p>`;
  props.appendChild(layersPanel);
  const style = document.createElement('style');
  style.textContent = '#p4-layers-list .p4-row{display:flex;align-items:center;gap:4px;font-size:11px;color:#cfe0f2;background:#0b2138;border:1px solid #16324e;border-radius:5px;padding:3px 5px;cursor:pointer}'
    + '#p4-layers-list .p4-row[data-active="1"]{border-color:#0bb7ff;color:#fff}'
    + '#p4-layers-list .p4-row button{background:none;border:none;color:#9fd0ff;cursor:pointer;font-size:11px;padding:0 2px;width:auto;min-width:0;margin-top:0;flex:0 0 auto}'
    + '#p4-layers-list .p4-row .p4-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
  document.head.appendChild(style);
  layersPanel.querySelector('#p4-group').addEventListener('click', () => {
    // Source canonique de la multi-sélection : module flyer-7g (Maj+clic).
    const ids = window.__flyer7gSelection?.ids() ?? [];
    if (ids.length >= 2) groupSelection(ids);
  });
  layersPanel.querySelector('#p4-ungroup').addEventListener('click', () => {
    const id = host()?.getSelected();
    if (id) ungroup(id);
  });
}

/** Repeint la liste des calques (premier plan en haut) depuis le tableau racine. */
function syncLayers() {
  if (!layersPanel) return;
  const list = layersPanel.querySelector('#p4-layers-list');
  const root = topLevelGetItems ? topLevelGetItems() : [];
  const sel = selectedId();
  list.replaceChildren();
  [...root].reverse().forEach(it => {
    const row = document.createElement('div');
    row.className = 'p4-row';
    if (it.id === sel) row.dataset.active = '1';
    const label = document.createElement('span');
    label.className = 'p4-label';
    label.textContent = labelOf(it) + (it.type === 'group' ? ` (${(it.children || []).length})` : '');
    const vis = document.createElement('button');
    vis.type = 'button'; vis.title = it.hidden ? 'Afficher' : 'Masquer';
    vis.textContent = it.hidden ? '○' : '●';
    vis.addEventListener('click', e => {
      e.stopPropagation();
      host().snapshot();
      it.hidden = !it.hidden;
      host().render();
    });
    const lock = document.createElement('button');
    lock.type = 'button'; lock.title = it.locked ? 'Déverrouiller' : 'Verrouiller';
    lock.textContent = it.locked ? '▣' : '□';
    lock.addEventListener('click', e => {
      e.stopPropagation();
      host().snapshot();
      it.locked = !it.locked;
      host().render();
    });
    row.append(label, vis, lock);
    row.addEventListener('click', () => { window.select(it.id); host().render(); });
    list.appendChild(row);
  });
}

// ─── Verrouillage : masquer les poignées P3 ─────────────────────────────────

function syncLockOverlay() {
  const ov = document.getElementById('p3-overlay');
  if (!ov) return;
  const h = host();
  const sel = h?.getSelected();
  const it = sel ? h.getItems().find(v => v.id === sel) : null;
  ov.style.display = (it && it.locked) ? 'none' : '';
}

// ─── Assets (T29) : hash, licence, provenance ───────────────────────────────

/** Map src → { status:'pending'|'ok'|'missing_asset', sha256, license, provenance } */
const assetMeta = new Map();

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function settleAssetStatus(src) {
  const meta = assetMeta.get(src);
  if (!meta || meta.status !== 'pending') return;
  try {
    const res = await fetch(src, { cache: 'no-store' });
    if (!res.ok) { meta.status = 'missing_asset'; return; }
    const buf = await res.arrayBuffer();
    meta.sha256 = await sha256Hex(buf);
    meta.status = 'ok';
    meta.bytes = buf.byteLength;
  } catch {
    meta.status = 'missing_asset';
  }
}

/** (Re)scanne les images de la scène et lance la vérification des assets. */
function refreshAssets() {
  const all = flatten(topLevelGetItems ? topLevelGetItems() : []);
  for (const it of all) {
    if (!IMAGE_TYPES.includes(it.type) || typeof it.src !== 'string' || !it.src) continue;
    if (assetMeta.has(it.src)) continue;
    assetMeta.set(it.src, {
      status: 'pending',
      sha256: null,
      license: 'TO_VERIFY',
      provenance: it.src.startsWith('data:') ? 'data URI embarquée dans le projet' : `fichier projet : ${it.src}`,
    });
    settleAssetStatus(it.src);
  }
}

// ─── Préflight export synchrone : bloque si un asset est manquant ───────────

function armExportPreflight() {
  const api = window.__readoxFlyerPhase8;
  if (api && !api.__p4PreflightWrapped) {
    // La capture et l'export SVG passent par ce pont : synchroniser les groupes d'abord.
    const origCapture = api.capture, origSvg = api.svg;
    api.capture = (...a) => { syncGroupBaselines(); return origCapture(...a); };
    api.svg = (...a) => { syncGroupBaselines(); return origSvg(...a); };
    api.__p4PreflightWrapped = true;
  }
  // Écoute en capture sur window : tire avant tout écouteur de la cible,
  // indépendamment de l'ordre de chargement des scripts (GF-04.1, C3…).
  if (window.__readoxP4PreflightArmed) return;
  window.__readoxP4PreflightArmed = true;
  window.addEventListener('click', e => {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest('#export')) return;
    syncGroupBaselines();
    refreshAssets();
    const doc = window.__readoxFlyerPhase8?.capture?.();
    const all = flatten(doc?.items || []);
    const missing = all.filter(it => IMAGE_TYPES.includes(it.type) && it.src
      && assetMeta.get(it.src)?.status === 'missing_asset');
    if (missing.length) {
      e.preventDefault(); e.stopImmediatePropagation();
      alert(`Export bloqué : ${missing.length} asset(s) manquant(s) — ${missing.map(it => it.src).join(', ')}`);
      return;
    }
    const pending = all.filter(it => IMAGE_TYPES.includes(it.type) && it.src
      && assetMeta.get(it.src)?.status === 'pending');
    if (pending.length) {
      e.preventDefault(); e.stopImmediatePropagation();
      // BG-L10 (D37) : #status n'existe pas dans la page Flyer Maker — sans repli
      // vers le statut du panneau d'export, le blocage était silencieux.
      const status = document.getElementById('status') || document.querySelector('.fly-7n-status');
      if (status) status.textContent = 'Vérification des assets en cours — relancez l’export.';
    }
  }, true);
}

// ─── Installation ───────────────────────────────────────────────────────────

function install() {
  const h = host();
  if (!h || !document.querySelector('.props') || !document.getElementById('page')) return false;
  if (window.__readoxP4GroupsInstalled) return true;
  window.__readoxP4GroupsInstalled = true;

  // Capturer le lecteur racine AVANT d'enrober getItems.
  topLevelGetItems = h.getItems;
  h.getTopLevel = () => topLevelGetItems();
  h.getItems = () => flatten(topLevelGetItems());

  buildLayersPanel();
  installPointerHooks();
  armExportPreflight();

  // Enrobage du rendu : boîtes de groupe à jour, puis panneaux et verrou.
  const prevRender = window.render;
  if (typeof prevRender === 'function') {
    window.render = function (...a) {
      syncGroupBaselines();
      const r = prevRender(...a);
      syncLayers();
      syncLockOverlay();
      return r;
    };
  }

  window.ReadoxP4Groups = {
    version: '4.0.0',
    group: groupSelection,
    ungroup,
    flatten: list => flatten(list || topLevelGetItems()),
    locate,
    syncGroupBaselines,
    assetMeta,
    refreshAssets,
    settleAssetStatus,
  };

  syncGroupBaselines();
  refreshAssets();
  // BG-L10 (D37) : la vérification des assets doit suivre l'ouverture d'un modèle,
  // pas seulement le chargement initial — sinon le premier clic « Exporter » après
  // ouverture d'un modèle tombait sur des statuts 'pending' et bloquait silencieusement.
  document.addEventListener('readox:flyer:model-opened', () => refreshAssets());
  // BG-L10 (D38) : même exigence après réouverture d'un projet enregistré (C5) ou
  // import d'un document legacy — sinon le premier export après restore était bloqué.
  document.addEventListener('readox:flyer:scene-restored', () => refreshAssets());
  h.render();
  return true;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install());
else install();
