/** BG-L1 — Modèle TEST « Le Bistrot Gourmand » (cahier BG-COMP-1.0 §8).
 *
 * Rôle à ce lot :
 *  - À l'ouverture du modèle depuis le catalogue (événement
 *    `readox:flyer:model-opened`), attribue à la **copie de travail** un
 *    `documentId` neuf, distinct de l'ID du modèle (BG05 : éditer une
 *    création utilisateur ne modifie jamais la source du catalogue).
 *  - Expose `window.ReadoxBG` (constantes et inspecteurs) pour les portes.
 *
 * Le `documentId` est persisté par le circuit canonique (state/validate/
 * restore de l'éditeur, étendu en liste blanche — voir fiche BG-L1) :
 * sauvegarde, réouverture et export le conservent ; seule une nouvelle
 * ouverture du modèle depuis le catalogue en régénère un.
 *
 * Aucun état parallèle : le module ne touche ni la scène, ni l'historique,
 * ni le rendu ; il ne fait qu'identifier la copie de travail.
 */

import { loadFonts } from '../gf01.mjs';

export const BG_MODEL_ID = 'REST-BISTROT-GOURMAND-TEST-001';
const BG_DOC_URL = '/flyer-models/restaurant-bistrot-gourmand.json';

/** Polices déclarées par le modèle (metadata.fonts) — chargées une fois par
 * session, partagées par le rendu DOM, le miroir Fabric et l'aperçu. */
let fontsPromise = null;
function ensureFonts() {
  if (!fontsPromise) {
    fontsPromise = fetch(BG_DOC_URL)
      .then(r => (r.ok ? r.json() : null))
      .then(doc => loadFonts(doc?.metadata?.fonts || []))
      .catch(() => ({ loaded: [], failed: [] }));
  }
  return fontsPromise;
}

function freshDocumentId() {
  const rnd = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return 'bgdoc-' + rnd;
}

document.addEventListener('readox:flyer:model-opened', (e) => {
  if (e?.detail?.id !== BG_MODEL_ID) return;
  window.ReadoxFlyerModelId = BG_MODEL_ID;
  window.ReadoxFlyerDocumentId = freshDocumentId();
  ensureFonts().then(() => document.dispatchEvent(new CustomEvent('readox:bg:fonts-ready', {
    detail: { modelId: BG_MODEL_ID }
  })));
  document.dispatchEvent(new CustomEvent('readox:bg:document-ready', {
    detail: { modelId: BG_MODEL_ID, documentId: window.ReadoxFlyerDocumentId }
  }));
});

// Cas « brouillon restauré » : la scène BG peut réapparaître sans événement
// model-opened (restauration C3 explicite) — les polices doivent suivre.
document.addEventListener('readox:flyer:draft-restored', () => {
  if (window.ReadoxFlyerModelId === BG_MODEL_ID) ensureFonts();
});

window.ReadoxBG = {
  MODEL_ID: BG_MODEL_ID,
  ensureFonts,
  get documentId() { return window.ReadoxFlyerDocumentId || null; },
  get modelId() { return window.ReadoxFlyerModelId || null; },
  get schemaVersion() { return window.ReadoxFlyerSchemaVersion || null; }
};
