/** VFE — Amorçage navigateur. Intégration strictement additive :
 * aucun panneau, bouton, route ou module existant n'est remplacé.
 * L'ancien chemin de rendu reste actif ; VFE expose ses services sous
 * window.__readoxVFE. Le service VFE est activé par défaut en TEST.
 * ?vfe=0 le désactive pour la session ; localStorage 'readox-vfe'='0'
 * le désactive durablement. Le rendu historique reste conservé.
 */
import { AssetManager, sha256Hex, defaultFetcher } from './asset-manager.mjs';
import { SceneController } from './scene-controller.mjs';
import { ExportEngine } from './export-engine.mjs';
import { preflight, createConsoleCollector } from './diagnostics.mjs';
import { validateZoneCoverage, ZONES, POSTER_FORMAT, namingContract } from './zone-contract.mjs';
import { compareBuffers, heatmap } from './fidelity.mjs';

const params = new URLSearchParams(location.search);
const explicit = params.get('vfe');
const stored = localStorage.getItem('readox-vfe');
const enabled = explicit === '1' ? true : explicit === '0' ? false : stored !== '0';
const collector = createConsoleCollector();

const assets = new AssetManager({ hasher: sha256Hex, fetcher: defaultFetcher });
const controller = new SceneController(null, { storage: localStorage });
const exporter = new ExportEngine({ resolveAsset: id => assets.get(id) });

async function loadManifest(url = '/readox-graphics/vfe/asset-manifest.json') {
  try {
    const res = await fetch(url);
    if (!res.ok) throw Error('HTTP_' + res.status);
    return assets.fromManifest(await res.json());
  } catch (e) {
    assets.log('MANIFEST_LOAD_FAILED', e.message);
    return 0;
  }
}

function syncFromLegacy() {
  const api = window.__readoxFlyerPhase8;
  if (!api?.capture) return false;
  try {
    controller.openProject(api.capture());
    return true;
  } catch (e) {
    assets.log('LEGACY_SYNC_FAILED', e.message);
    return false;
  }
}

const api = {
  version: 'VFE-1',
  enabled,
  assets, controller, exporter, zones: { ZONES, POSTER_FORMAT, namingContract, validate: doc => validateZoneCoverage(doc, { assetManager: assets }) },
  loadManifest, syncFromLegacy,
  compile: (doc, opts) => exporter.plan(doc || controller.getSnapshot(), opts),
  preflight: (doc, opts) => preflight(doc || controller.getSnapshot(), { assetManager: assets, fontChecker: f => document.fonts?.check?.(`12px "${f}"`) ?? null, ...opts }),
  exportSVG: (doc, opts) => exporter.toSVG(doc || controller.getSnapshot(), opts),
  exportPNG: (doc, opts) => exporter.toPNG(doc || controller.getSnapshot(), opts),
  exportJPG: (doc, opts) => exporter.toJPG(doc || controller.getSnapshot(), opts),
  exportPDF: (doc, opts) => exporter.toPDF(doc || controller.getSnapshot(), opts),
  thumbnail: (doc, opts) => exporter.thumbnail(doc || controller.getSnapshot(), opts),
  fidelity: { compareBuffers, heatmap },
  console: collector
};

/** Phase 1 (cahier v5.2 §12) — Scène unique : chaque mutation de l'éditeur
 * (sélection, texte, forme, image, undo/redo, ouverture de modèle) est reflétée
 * dans le SceneController VFE, qui devient l'observateur canonique de la scène.
 * Point d'observation unique : MutationObserver sur #page, qui couvre render(),
 * les glisser-déplacer (styles inline) et le changement de fond de page, sans
 * modifier les closures historiques. Débouclage par empreinte FNV-1a du graphe
 * capturé : une resynchronisation n'a lieu que si la scène a réellement changé. */
const sceneSync = { count: 0, lastHash: null, lastSyncAt: null, lastReason: null, errors: [] };
function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
function syncSceneNow(reason = 'manual') {
  const cap = window.__readoxFlyerPhase8?.capture?.();
  if (!cap) return false;
  const hash = fnv1a(JSON.stringify(cap));
  if (hash === sceneSync.lastHash) return false;
  try {
    controller.openProject(cap);
    sceneSync.lastHash = hash; sceneSync.count++;
    sceneSync.lastSyncAt = new Date().toISOString(); sceneSync.lastReason = reason;
    return true;
  } catch (e) { sceneSync.errors.push(String(e?.message || e).slice(0, 200)); return false; }
}
let syncTimer = 0;
function scheduleSceneSync(reason) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncSceneNow(reason), 150); }
function installSceneSync() {
  const pageEl = document.getElementById('page');
  if (!pageEl || typeof MutationObserver === 'undefined') return false;
  const observer = new MutationObserver(() => scheduleSceneSync('dom-mutation'));
  observer.observe(pageEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'src'] });
  document.addEventListener('readox:flyer:model-opened', () => scheduleSceneSync('model-opened'));
  return true;
}
api.sceneSync = sceneSync;
api.syncSceneNow = syncSceneNow;

window.__readoxVFE = api;
if (enabled) {
  collector.install();
  loadManifest().then(n => {
    if (syncSceneNow('init')) document.dispatchEvent(new CustomEvent('readox:vfe:ready', { detail: { assets: n } }));
    installSceneSync();
  });
}
document.dispatchEvent(new CustomEvent('readox:vfe:loaded', { detail: { enabled } }));
