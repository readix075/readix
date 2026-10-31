/** VFE — Gestionnaire de ressources et Asset Fidelity Gate (cahier des charges §1.1, §6.3).
 * Noyau sans DOM : les fonctions de hachage et de lecture sont injectées,
 * ce qui rend le module testable sous Node et utilisable dans le navigateur.
 *
 * Règles non négociables implémentées ici :
 *  - aucune substitution silencieuse : une ressource critique absente bloque la
 *    validation finale ; un marqueur de brouillon n'est admis qu'en mode 'draft' ;
 *  - aucun chemin fantôme : une ressource non livrée a uri:null et
 *    status:'missing_asset' ;
 *  - l'original n'est jamais modifié : les variantes référencent leur source.
 */

export const ASSET_KINDS = Object.freeze(['image', 'texture', 'mask', 'font', 'effect', 'icon', 'audio']);
export const ASSET_STATUS = Object.freeze(['available', 'missing_asset', 'pending', 'hash_mismatch', 'rejected']);
export const PLACEHOLDER_STYLE = Object.freeze({
  fill: 'rgba(200,166,106,0.10)',
  stroke: '#C8A66A',
  strokeDasharray: '8 5',
  labelFill: '#C8A66A'
});

const fail = (code, detail) => { const e = new Error(code + (detail ? ':' + detail : '')); e.code = code; throw e; };
const isHex64 = s => typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s);

export function normalizeAsset(raw) {
  if (!raw || typeof raw !== 'object') fail('ASSET_INVALID');
  if (typeof raw.id !== 'string' || !raw.id) fail('ASSET_ID_REQUIRED');
  if (!ASSET_KINDS.includes(raw.kind)) fail('ASSET_KIND_UNKNOWN', raw.kind);
  const status = raw.status || (raw.uri ? 'available' : 'missing_asset');
  if (!ASSET_STATUS.includes(status)) fail('ASSET_STATUS_UNKNOWN', status);
  if (status === 'available' && typeof raw.uri !== 'string') fail('ASSET_URI_REQUIRED', raw.id);
  if (raw.sha256 != null && !isHex64(raw.sha256)) fail('ASSET_HASH_INVALID', raw.id);
  return {
    id: raw.id,
    kind: raw.kind,
    role: typeof raw.role === 'string' ? raw.role : 'generic',
    uri: raw.uri ?? null,
    sha256: raw.sha256 ? raw.sha256.toLowerCase() : null,
    width: Number.isFinite(raw.width) ? raw.width : null,
    height: Number.isFinite(raw.height) ? raw.height : null,
    license: raw.license || 'TO_VERIFY',
    provenance: raw.provenance || 'unknown',
    critical: raw.critical === true,
    status,
    derivedFrom: raw.derivedFrom || null,
    variants: Array.isArray(raw.variants) ? raw.variants.map(String) : [],
    metadata: raw.metadata && typeof raw.metadata === 'object' ? { ...raw.metadata } : {}
  };
}

export class AssetManager {
  /** @param {{hasher?: (bytes:Uint8Array)=>Promise<string>, fetcher?: (uri:string)=>Promise<Uint8Array>}} deps */
  constructor(deps = {}) {
    this.assets = new Map();
    this.hasher = deps.hasher || null;
    this.fetcher = deps.fetcher || null;
    this.events = [];
  }

  log(code, detail) {
    this.events.push({ code, detail: String(detail) });
    if (this.events.length > 200) this.events.shift();
  }

  register(raw) {
    const asset = normalizeAsset(raw);
    if (asset.derivedFrom && !this.assets.has(asset.derivedFrom) && !this._pending?.has(asset.derivedFrom)) {
      // L'original peut être enregistré plus tard ; on trace simplement.
      this.log('DERIVED_BEFORE_SOURCE', asset.id);
    }
    this.assets.set(asset.id, asset);
    return structuredClone(asset);
  }

  /** Variante optimisée : conserve la relation avec l'original, jamais l'inverse. */
  registerVariant(sourceId, raw) {
    if (!this.assets.has(sourceId)) fail('ASSET_SOURCE_UNKNOWN', sourceId);
    const variant = this.register({ ...raw, derivedFrom: sourceId });
    this.assets.get(sourceId).variants.push(variant.id);
    return variant;
  }

  get(id) { const a = this.assets.get(id); return a ? structuredClone(a) : null; }
  list() { return [...this.assets.values()].map(a => structuredClone(a)); }

  remove(id) {
    const a = this.assets.get(id);
    if (!a) return false;
    for (const other of this.assets.values()) {
      if (other.derivedFrom === id) fail('ASSET_IN_USE_AS_SOURCE', id);
    }
    this.assets.delete(id);
    return true;
  }

  fromManifest(manifest) {
    const list = Array.isArray(manifest) ? manifest : manifest?.assets;
    if (!Array.isArray(list)) fail('MANIFEST_INVALID');
    for (const raw of list) this.register(raw);
    return this.assets.size;
  }

  toManifest() {
    return {
      format: 'readox-asset-manifest',
      version: 1,
      generatedAt: null, // volatil : renseigné par l'outil de génération, pas en production
      assets: this.list()
    };
  }

  /** Vérification d'intégrité : présence réelle + empreinte SHA-256 + dimensions déclarées. */
  async verify(id, { dimensions } = {}) {
    const asset = this.assets.get(id);
    if (!asset) fail('ASSET_UNKNOWN', id);
    if (!asset.uri) { asset.status = 'missing_asset'; return { id, ok: false, code: 'MISSING_ASSET' }; }
    if (!this.fetcher) return { id, ok: asset.status === 'available', code: 'VERIFY_SKIPPED_NO_FETCHER' };
    let bytes;
    try {
      bytes = await this.fetcher(asset.uri);
    } catch (e) {
      asset.status = 'missing_asset';
      this.log('FETCH_FAILED', id + ' ' + e.message);
      return { id, ok: false, code: 'FETCH_FAILED' };
    }
    if (asset.sha256) {
      if (!this.hasher) return { id, ok: false, code: 'HASHER_REQUIRED' };
      const hex = (await this.hasher(bytes)).toLowerCase();
      if (hex !== asset.sha256) {
        asset.status = 'hash_mismatch';
        this.log('HASH_MISMATCH', id);
        return { id, ok: false, code: 'HASH_MISMATCH', expected: asset.sha256, actual: hex };
      }
    }
    if (dimensions && asset.width != null && dimensions.width !== asset.width) {
      this.log('DIMENSION_MISMATCH', id);
      return { id, ok: false, code: 'DIMENSION_MISMATCH', expected: asset.width, actual: dimensions.width };
    }
    asset.status = 'available';
    return { id, ok: true, code: 'VERIFIED' };
  }

  async verifyAll(opts) {
    const out = [];
    for (const id of this.assets.keys()) out.push(await this.verify(id, opts));
    return out;
  }

  /** Références d'assets réellement utilisées par un document canonique v3. */
  static referencedAssets(doc) {
    const used = new Set();
    for (const n of Object.values(doc?.nodes || {})) {
      if (n.assetRef) used.add(n.assetRef);
      if (n.fontRef) used.add(n.fontRef);
    }
    return used;
  }

  /** Contrôle de complétude d'un document : chaque référence doit résoudre vers un asset disponible. */
  checkDocument(doc) {
    const issues = [];
    for (const ref of AssetManager.referencedAssets(doc)) {
      const asset = this.assets.get(ref);
      if (!asset) issues.push({ code: 'ASSET_REF_UNKNOWN', assetRef: ref, blocking: true });
      else if (asset.status !== 'available') issues.push({ code: 'ASSET_UNAVAILABLE', assetRef: ref, status: asset.status, blocking: asset.critical });
    }
    return issues;
  }

  /**
   * Asset Fidelity Gate — contrôle avant rendu/validation.
   * mode 'final' : toute ressource critique absente est bloquante ;
   * mode 'draft' : les absences produisent des marqueurs de brouillon visibles,
   * exclus de la validation finale et jamais confondus avec le rendu cible.
   */
  fidelityGate(doc, { mode = 'final' } = {}) {
    if (!['final', 'draft'].includes(mode)) fail('GATE_MODE_INVALID');
    const blocking = [], warnings = [], substitutions = [];
    for (const issue of this.checkDocument(doc)) {
      if (issue.blocking && mode === 'final') blocking.push({ ...issue, code: 'FIDELITY_BLOCK_' + issue.code });
      else warnings.push(issue);
    }
    for (const asset of this.assets.values()) {
      if (asset.critical && asset.status !== 'available') {
        const entry = { code: 'FIDELITY_BLOCK_CRITICAL_ASSET', assetId: asset.id, role: asset.role, status: asset.status };
        if (mode === 'final') blocking.push(entry); else {
          warnings.push(entry);
          substitutions.push({ assetId: asset.id, kind: 'draft-placeholder', visible: true, excludedFromValidation: true });
        }
      }
      if (asset.license === 'TO_VERIFY' && asset.critical) {
        warnings.push({ code: 'LICENSE_UNVERIFIED', assetId: asset.id });
      }
    }
    return {
      mode,
      ok: blocking.length === 0,
      conforme: blocking.length === 0 && mode === 'final',
      blocking, warnings, substitutions
    };
  }

  /** Marqueur de brouillon VISIBLE : jamais une imitation de la ressource manquante. */
  draftPlaceholderNode(assetId, geometry) {
    const asset = this.assets.get(assetId);
    return {
      id: 'draft-' + assetId,
      type: 'placeholder',
      role: 'draft-placeholder',
      geometry: { ...geometry },
      appearance: { visible: true, opacity: 1, fill: PLACEHOLDER_STYLE.fill, stroke: PLACEHOLDER_STYLE.stroke },
      extensions: {
        vfeDraft: true,
        missingAsset: assetId,
        missingRole: asset?.role || 'generic',
        label: 'RESSOURCE MANQUANTE : ' + assetId,
        excludedFromValidation: true
      }
    };
  }

  diagnostics() { return [...this.events]; }
}

/** Hash SHA-256 portable : Node (node:crypto) ou navigateur (crypto.subtle). */
export async function sha256Hex(bytes) {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(bytes).digest('hex');
  }
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Fetcher portable : Node (node:fs pour chemins locaux) ou navigateur (fetch). */
export async function defaultFetcher(uri) {
  if (uri.startsWith('data:')) {
    const base64 = uri.slice(uri.indexOf(',') + 1);
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(base64, 'base64'));
    const bin = atob(base64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (typeof process !== 'undefined' && process.versions?.node && !/^https?:/.test(uri)) {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(uri));
  }
  const res = await fetch(uri, { mode: 'cors' });
  if (!res.ok) throw Error('HTTP_' + res.status);
  return new Uint8Array(await res.arrayBuffer());
}
