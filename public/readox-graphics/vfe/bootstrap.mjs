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

window.__readoxVFE = api;
if (enabled) {
  collector.install();
  loadManifest().then(n => {
    if (syncFromLegacy()) document.dispatchEvent(new CustomEvent('readox:vfe:ready', { detail: { assets: n } }));
  });
}
document.dispatchEvent(new CustomEvent('readox:vfe:loaded', { detail: { enabled } }));
