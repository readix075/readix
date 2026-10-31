/** VFE — Contrôleur de scène canonique (cahier des charges §5, §6.4, §7).
 * Étend le contrôleur GF-05D.1 (transactions atomiques, révisions, undo/redo)
 * avec : calques, groupes, commandes d'assets, redimensionnement de page
 * (fit/crop, reflow explicitement non supporté), projets sauvegardés avec
 * empreinte de structure, autosave avec reprise, et migration historique avec
 * copie logique préalable (aucune conversion irréversible sans sauvegarde).
 *
 * Sans DOM : le stockage est injecté (localStorage dans le navigateur,
 * Map en mémoire sous Node pour les tests).
 */
import { CanonicalController } from '../gf05d1/controller.mjs';
import { clone, normalizeNode, serialize, deserialize, newDocument } from '../gf05a/document-core.mjs';
import { migrateLegacy } from '../gf05a/document-migrations.mjs';
import { validateDocument } from '../gf05a/document-validator.mjs';
import { resizePage } from '../gf05d/geometry.mjs';

const fail = (code, detail) => { const e = new Error(code + (detail ? ':' + detail : '')); e.code = code; throw e; };
const VOLATILE_KEYS = new Set(['savedAt', 'openedAt', 'sessionId']);

/** Hash structurel stable : sérialisation canonique moins les métadonnées volatiles. */
export function structureHash(doc, hashFn = null) {
  const d = clone(doc);
  if (d.metadata) for (const k of Object.keys(d.metadata)) if (VOLATILE_KEYS.has(k)) delete d.metadata[k];
  const text = serialize(d);
  if (hashFn) return hashFn(text);
  // FNV-1a 64 bits : déterministe, suffisant pour comparer des structures (pas un usage crypto).
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ (c & 0xff), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c >> 8), 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export class SceneController {
  constructor(source, { storage = null, autosaveKey = 'readox-vfe-autosave', limit = 100 } = {}) {
    this.core = new CanonicalController(source || newDocument(), { limit });
    this.storage = storage;
    this.autosaveKey = autosaveKey;
    this.diagnostics = [];
  }

  log(code, detail) {
    this.diagnostics.push({ code, detail: String(detail) });
    if (this.diagnostics.length > 200) this.diagnostics.shift();
  }

  getSnapshot() { return this.core.getSnapshot(); }
  get revision() { return this.core.revision; }
  subscribe(fn) { return this.core.subscribe(fn); }
  dispatch(command) { return this.core.dispatch(command); }
  undo() { return this.core.undo(); }
  redo() { return this.core.redo(); }
  serialize() { return this.core.serialize(); }
  hash() { return structureHash(this.core.getSnapshot()); }

  /** Commande générique appliquée dans une transaction validée. */
  apply(label, mutator, opts = {}) {
    return this.core.transact(doc => mutator(doc), { label, ...opts });
  }

  // ---- Nœuds ----

  addNode(node, { pageId } = {}) {
    const n = normalizeNode(node);
    return this.apply('node.add', doc => {
      if (doc.nodes[n.id]) fail('NODE_ID_DUPLICATE', n.id);
      const page = doc.pages.find(p => p.id === (pageId || n.pageId)) || doc.pages[0];
      if (n.parentId) {
        const parent = doc.nodes[n.parentId];
        if (!parent) fail('PARENT_NOT_FOUND', n.parentId);
        parent.children = [...(parent.children || []), n.id];
      } else page.rootIds.push(n.id);
      doc.nodes[n.id] = n;
    });
  }

  reorderNode(id, direction) {
    if (!['front', 'back', 'forward', 'backward'].includes(direction)) fail('REORDER_INVALID');
    return this.apply('node.reorder', doc => {
      const list = doc.pages[0].rootIds;
      const i = list.indexOf(id);
      if (i < 0) fail('NODE_NOT_ROOT', id);
      const j = direction === 'front' ? list.length - 1
        : direction === 'back' ? 0
        : direction === 'forward' ? Math.min(list.length - 1, i + 1)
        : Math.max(0, i - 1);
      list.splice(j, 0, list.splice(i, 1)[0]);
    });
  }

  groupNodes(ids, groupId) {
    if (!Array.isArray(ids) || ids.length < 2) fail('GROUP_REQUIRES_TWO_NODES');
    return this.apply('node.group', doc => {
      for (const id of ids) if (!doc.nodes[id]) fail('NODE_NOT_FOUND', id);
      const page = doc.pages[0];
      const firstIndex = Math.min(...ids.map(id => page.rootIds.indexOf(id)).filter(i => i >= 0));
      const group = normalizeNode({
        id: groupId, type: 'group', role: 'container',
        geometry: { x: 0, y: 0, width: 1, height: 1 },
        children: [...ids]
      });
      doc.nodes[groupId] = group;
      for (const id of ids) {
        doc.nodes[id].parentId = groupId;
        page.rootIds = page.rootIds.filter(x => x !== id);
      }
      page.rootIds.splice(firstIndex < 0 ? page.rootIds.length : firstIndex, 0, groupId);
    });
  }

  ungroup(groupId) {
    return this.apply('node.ungroup', doc => {
      const group = doc.nodes[groupId];
      if (!group || group.type !== 'group') fail('GROUP_NOT_FOUND', groupId);
      const page = doc.pages[0];
      const at = page.rootIds.indexOf(groupId);
      const children = group.children || [];
      for (const id of children) if (doc.nodes[id]) doc.nodes[id].parentId = null;
      page.rootIds.splice(at < 0 ? page.rootIds.length : at, 1, ...children);
      delete doc.nodes[groupId];
    });
  }

  // ---- Calques ----

  addLayer(id, { order } = {}) {
    return this.apply('layer.add', doc => {
      if (doc.layers.some(l => l.id === id)) fail('LAYER_DUPLICATE', id);
      doc.layers.push({ id, order: order ?? doc.layers.length, visible: true, locked: false });
    });
  }

  setLayer(id, patch) {
    return this.apply('layer.set', doc => {
      const layer = doc.layers.find(l => l.id === id);
      if (!layer) fail('LAYER_NOT_FOUND', id);
      if (patch.visible !== undefined) layer.visible = !!patch.visible;
      if (patch.locked !== undefined) layer.locked = !!patch.locked;
      if (patch.order !== undefined && Number.isFinite(patch.order)) layer.order = patch.order;
      if (patch.name !== undefined) layer.name = String(patch.name).slice(0, 120);
    });
  }

  reorderLayers(orderedIds) {
    return this.apply('layer.reorder', doc => {
      const have = new Set(doc.layers.map(l => l.id));
      if (orderedIds.length !== have.size || !orderedIds.every(id => have.has(id))) fail('LAYER_SET_MISMATCH');
      doc.layers = orderedIds.map((id, order) => ({ ...doc.layers.find(l => l.id === id), order }));
    });
  }

  // ---- Assets documentaires ----

  registerAssetRef(asset) {
    if (!asset?.id) fail('ASSET_ID_REQUIRED');
    return this.apply('asset.register', doc => {
      doc.assets[asset.id] = clone(asset);
    });
  }

  removeAssetRef(id) {
    return this.apply('asset.remove', doc => {
      for (const n of Object.values(doc.nodes)) {
        if (n.assetRef === id || n.fontRef === id) fail('ASSET_IN_USE', id);
      }
      if (!doc.assets[id]) fail('ASSET_NOT_FOUND', id);
      delete doc.assets[id];
    });
  }

  // ---- Page ----

  resizePage(newW, newH, mode = 'fit') {
    const result = resizePage(this.core.doc.pages[0], newW, newH, mode === 'fit' ? 'scale' : mode);
    if (!result.supported) fail(result.code);
    return this.apply('page.resize', doc => {
      const page = doc.pages[0];
      for (const n of Object.values(doc.nodes)) {
        if (n.parentId) continue; // les enfants suivent leur parent
        n.geometry.x = n.geometry.x * result.scale + result.dx;
        n.geometry.y = n.geometry.y * result.scale + result.dy;
        if (mode === 'fit') { n.geometry.width *= result.scale; n.geometry.height *= result.scale; }
      }
      page.width = newW; page.height = newH;
    }, { selection: [] });
  }

  // ---- Projet : sauvegarde / réouverture / migration ----

  saveProject(name = 'Sans titre') {
    const doc = this.core.getSnapshot();
    doc.metadata = { ...doc.metadata, title: name, savedAt: new Date().toISOString() };
    const payload = {
      format: 'readox-vfe-project',
      version: 1,
      revision: this.core.revision,
      structureHash: structureHash(doc),
      document: doc
    };
    return { text: JSON.stringify(payload), hash: payload.structureHash, revision: payload.revision };
  }

  /** Réouverture : migration si historique, copie logique avant conversion, hash comparé. */
  openProject(raw, { expectedHash = null } = {}) {
    const source = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const doc = source?.format === 'readox-vfe-project' ? source.document : source;
    // Copie logique de l'état courant avant toute conversion irréversible.
    const backup = this.core.getSnapshot();
    let migrated;
    try {
      migrated = doc?.format === 'readox-graphic-document' ? clone(doc) : migrateLegacy(doc).document;
      const report = validateDocument(migrated);
      if (!report.ok) fail('DOCUMENT_INVALID', report.errors.map(e => e.code).join(','));
    } catch (e) {
      this.log('OPEN_REJECTED', e.message);
      throw e; // l'état courant n'a pas été touché
    }
    this.core = new CanonicalController(migrated, { limit: this.core.limit });
    const afterHash = this.hash();
    if (expectedHash && afterHash !== expectedHash) {
      this.log('HASH_MISMATCH_AFTER_OPEN', expectedHash + ' != ' + afterHash);
      return { ok: true, hashMatch: false, backupRetained: backup, hash: afterHash };
    }
    return { ok: true, hashMatch: true, hash: afterHash };
  }

  // ---- Autosave avec reprise ----

  autosave() {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.autosaveKey, this.saveProject().text);
      return true;
    } catch (e) { this.log('AUTOSAVE_FAILED', e.message); return false; }
  }

  recover() {
    if (!this.storage) return null;
    const raw = this.storage.getItem(this.autosaveKey);
    if (!raw) return null;
    try { return this.openProject(raw); }
    catch (e) { this.log('RECOVERY_FAILED', e.message); return null; }
  }

  discardRecovery() { this.storage?.removeItem?.(this.autosaveKey); }

  diagnosticsReport() { return { revision: this.core.revision, core: this.core.getDiagnostics(), vfe: [...this.diagnostics] }; }
}

export { newDocument, deserialize };
