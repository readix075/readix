/** VFE — Compilateur de scène (cahier des charges §6.5).
 * Transforme le document canonique v3 en plan de rendu ordonné, indépendant
 * du viewport : même entrée pour l'éditeur (Fabric), les miniatures, l'aperçu
 * et les exports (§6.7, parité de rendu).
 *
 * Chaque opération porte un statut de fidélité :
 *  - 'native'      : rendu direct par le moteur cible ;
 *  - 'composite'   : rendu par combinaison de primitives (dégradé, ombre…) ;
 *  - 'fallback'    : approximation documentée, signalée ;
 *  - 'unsupported' : pas de rendu fidèle ; marqueur explicite, jamais muet.
 *  - 'missing'     : ressource absente ; remplacée par un marqueur de brouillon
 *                    visible uniquement si allowDraftPlaceholder est vrai.
 */
import { globalMatrix, bounds as nodeBounds } from '../gf05a/document-geometry.mjs';
import { capability } from '../gf05d/capabilities.mjs';

const IMAGE_TYPES = new Set(['image', 'imageFrame', 'imageMask']);
const TEXT_TYPES = new Set(['text', 'textbox', 'richText', 'textOnPath']);

export function orderedSceneNodes(doc, pageId) {
  const page = doc.pages.find(p => p.id === pageId) || doc.pages[0];
  if (!page) throw Error('PAGE_NOT_FOUND');
  const layerOrder = new Map((doc.layers || []).map(l => [l.id, l.order ?? 0]));
  const out = [];
  const visit = (id, layerIdx) => {
    const n = doc.nodes[id];
    if (!n || n.appearance?.visible === false) return;
    const layer = doc.layers?.find(l => l.id === n.layerId);
    if (layer && layer.visible === false) return;
    out.push(n);
    const children = (n.children || [])
      .slice()
      .sort((a, b) => (doc.nodes[a]?.order || 0) - (doc.nodes[b]?.order || 0));
    for (const c of children) visit(c, layerIdx);
  };
  const roots = page.rootIds.slice().sort((a, b) => {
    const la = layerOrder.get(doc.nodes[a]?.layerId) ?? 0;
    const lb = layerOrder.get(doc.nodes[b]?.layerId) ?? 0;
    return la - lb;
  });
  for (const id of roots) visit(id, layerOrder.get(doc.nodes[id]?.layerId) ?? 0);
  return out;
}

function imageOps(doc, node, resolveAsset) {
  const asset = node.assetRef ? doc.assets?.[node.assetRef] : null;
  const uri = asset?.uri || resolveAsset?.(node.assetRef)?.uri || null;
  const status = !node.assetRef ? 'fallback' : (uri ? 'native' : 'missing');
  const spec = {
    fit: node.image?.fit || 'cover',
    crop: node.image?.crop || null,
    focal: node.image?.focal || { x: 0.5, y: 0.5 },
    cornerRadius: node.image?.cornerRadius || 0,
    mask: node.image?.mask || null,
    filters: Array.isArray(node.image?.filters) ? node.image.filters.slice() : []
  };
  return { uri, assetId: node.assetRef || null, status, spec };
}

export function compileScene(doc, { pageId, resolveAsset, allowDraftPlaceholder = false } = {}) {
  const page = doc.pages.find(p => p.id === pageId) || doc.pages[0];
  if (!page) throw Error('PAGE_NOT_FOUND');
  const ops = [];
  const unsupported = [];
  const fallbacks = [];
  const missing = [];

  for (const node of orderedSceneNodes(doc, page.id)) {
    const matrix = globalMatrix(doc, node.id);
    const g = node.geometry, a = node.appearance || {};
    const base = {
      id: node.id, type: node.type, matrix,
      opacity: a.opacity ?? 1,
      fill: a.fill ?? null,
      stroke: a.stroke ?? null,
      strokeWidth: a.strokeWidth ?? 0,
      blendMode: a.blendMode || 'normal',
      shadow: a.shadow || null,
      locked: node.interaction?.locked === true
    };
    let op = null;

    if (TEXT_TYPES.has(node.type)) {
      op = { ...base, kind: 'text', status: node.type === 'text' || node.type === 'textbox' ? 'native' : capability(node.type).status === 'unsupported' ? 'unsupported' : 'composite',
        x: g.x, y: g.y, width: g.width, height: g.height,
        text: node.text ?? '', typography: node.typography || {}, fontRef: node.fontRef || null };
    } else if (IMAGE_TYPES.has(node.type)) {
      const img = imageOps(doc, node, resolveAsset);
      op = { ...base, kind: 'image', status: img.status, x: g.x, y: g.y, width: g.width, height: g.height, ...img };
      if (img.status === 'missing') missing.push({ id: node.id, assetRef: img.assetId });
    } else if (node.type === 'group') {
      op = { ...base, kind: 'group', status: 'composite', children: (node.children || []).slice() };
    } else if (['rect', 'roundedRect', 'frame', 'placeholder'].includes(node.type)) {
      op = { ...base, kind: 'rect', status: 'native', x: g.x, y: g.y, width: g.width, height: g.height, radius: node.type === 'roundedRect' ? (node.cornerRadius ?? 12) : 0 };
    } else if (['ellipse', 'circle'].includes(node.type)) {
      op = { ...base, kind: 'ellipse', status: 'native', x: g.x, y: g.y, width: g.width, height: g.height };
    } else if (node.type === 'line') {
      op = { ...base, kind: 'line', status: 'native', x: g.x, y: g.y, width: g.width, height: g.height };
    } else if (['polygon', 'triangle', 'star', 'regularPolygon', 'polyline'].includes(node.type)) {
      op = { ...base, kind: 'polygon', status: 'native', x: g.x, y: g.y, width: g.width, height: g.height,
        points: node.points || null, spikes: node.spikes || 5, closed: node.type !== 'polyline' };
    } else if (['path', 'arc', 'sector', 'compoundPath', 'brushStroke'].includes(node.type)) {
      op = { ...base, kind: 'path', status: capability(node.type).status === 'unsupported' ? 'unsupported' : 'composite',
        d: node.path || null, x: g.x, y: g.y, width: g.width, height: g.height };
    } else if (['svg', 'icon', 'symbolInstance'].includes(node.type)) {
      op = { ...base, kind: 'svg', status: 'composite', svg: node.svg || null, x: g.x, y: g.y, width: g.width, height: g.height };
    } else {
      op = { ...base, kind: 'unsupported', status: 'unsupported', x: g.x, y: g.y, width: g.width, height: g.height,
        reason: capability(node.type).reason || 'UNREGISTERED_TYPE' };
    }

    if (op.status === 'unsupported') unsupported.push({ id: node.id, type: node.type, reason: op.reason || capability(node.type).reason });
    if (op.status === 'fallback') fallbacks.push({ id: node.id, type: node.type });
    if (op.status === 'missing' && allowDraftPlaceholder) {
      op = { ...base, kind: 'draftPlaceholder', status: 'missing', x: g.x, y: g.y, width: g.width, height: g.height,
        label: 'RESSOURCE MANQUANTE : ' + (op.assetId || node.type) };
    }
    ops.push(op);
  }

  return {
    format: 'readox-vfe-renderplan',
    version: 1,
    page: { width: page.width, height: page.height, background: page.background || '#ffffff' },
    ops,
    report: {
      nodeCount: ops.length,
      unsupported, fallbacks, missing,
      fidelity: unsupported.length || missing.length ? 'degraded' : (fallbacks.length ? 'fallback-present' : 'native')
    }
  };
}

export function sceneBounds(plan) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const op of plan.ops) {
    if (op.x == null) continue;
    minX = Math.min(minX, op.x); minY = Math.min(minY, op.y);
    maxX = Math.max(maxX, op.x + (op.width || 0)); maxY = Math.max(maxY, op.y + (op.height || 0));
  }
  if (!opsFinite(minX)) return { x: 0, y: 0, width: plan.page.width, height: plan.page.height };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
const opsFinite = v => Number.isFinite(v);
export { nodeBounds };
