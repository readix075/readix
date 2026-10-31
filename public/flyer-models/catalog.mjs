/** Readox Flyer Maker — Source unique du catalogue (cahier v5.2 §7.4, Phase 1).
 * registry.json est autoritaire ; l'interface ne maintient aucune liste
 * parallèle de modèles. Fonctions pures, testables sous Node comme
 * dans le navigateur. Aucune donnée de modèle n'est supprimée : le
 * retrait d'un modèle du catalogue actif est un statut, pas une
 * suppression (historique préservé).
 */

export const REGISTRY_URL = '/flyer-models/registry.json';

/** Statuts reconnus. Seul `publie` apparaît dans le catalogue actif. */
export const MODEL_STATUS = Object.freeze({
  PUBLISHED: 'publie',
  IN_VALIDATION: 'en-validation',
  RETIRED: 'retire',
  DRAFT: 'brouillon'
});

/** Champs obligatoires d'un modèle selon §7.4. */
export const REQUIRED_MODEL_FIELDS = [
  'id', 'name', 'categoryId', 'document', 'preview',
  'format', 'assets', 'license', 'status', 'version', 'languages', 'conformity'
];

/** Valide la structure du registre. Lève Error avec code REGISTRY_* sur défaut. */
export function normalizeRegistry(raw) {
  if (!raw || typeof raw !== 'object') throw Error('REGISTRY_INVALID: objet attendu');
  if (!Array.isArray(raw.categories)) throw Error('REGISTRY_INVALID: categories[] requis');
  if (!Array.isArray(raw.models)) throw Error('REGISTRY_INVALID: models[] requis');
  const catIds = new Set();
  for (const c of raw.categories) {
    if (!c?.id || !c?.name) throw Error('REGISTRY_INVALID: catégorie sans id/name');
    if (catIds.has(c.id)) throw Error('REGISTRY_INVALID: catégorie dupliquée ' + c.id);
    catIds.add(c.id);
  }
  const modelIds = new Set();
  for (const m of raw.models) {
    for (const f of REQUIRED_MODEL_FIELDS) {
      if (m?.[f] === undefined) throw Error(`REGISTRY_INVALID: modèle ${m?.id || '?'} sans champ « ${f} » (§7.4)`);
    }
    if (modelIds.has(m.id)) throw Error('REGISTRY_INVALID: modèle dupliqué ' + m.id);
    modelIds.add(m.id);
    if (!catIds.has(m.categoryId)) throw Error('REGISTRY_INVALID: modèle ' + m.id + ' référence une catégorie inconnue ' + m.categoryId);
    if (!Object.values(MODEL_STATUS).includes(m.status)) throw Error('REGISTRY_INVALID: statut inconnu « ' + m.status + ' » pour ' + m.id);
  }
  return raw;
}

/** Modèles du catalogue actif : statut « publie » uniquement. */
export function activeModels(registry) {
  return normalizeRegistry(registry).models.filter(m => m.status === MODEL_STATUS.PUBLISHED);
}

/** Nombre de modèles actifs par catégorie (les catégories vides existent quand même). */
export function activeModelCounts(registry) {
  const reg = normalizeRegistry(registry);
  const counts = Object.fromEntries(reg.categories.map(c => [c.id, 0]));
  for (const m of reg.models) if (m.status === MODEL_STATUS.PUBLISHED) counts[m.categoryId]++;
  return counts;
}

/** Catégories dans l'ordre du registre (indépendantes des modèles, §7.4). */
export function registryCategories(registry) {
  return normalizeRegistry(registry).categories.map(c => ({ id: c.id, name: c.name }));
}

/** Charge le registre via fetch injectable. Aucune liste de repli codée en dur :
 * en cas d'échec, l'appelant reçoit une erreur et affiche un catalogue vide honnête. */
export async function loadRegistry({ url = REGISTRY_URL, fetcher = null } = {}) {
  const f = fetcher || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) throw Error('REGISTRY_LOAD_FAILED: fetch indisponible');
  const res = await f(url, { cache: 'no-cache' });
  if (!res.ok) throw Error('REGISTRY_LOAD_FAILED: HTTP_' + res.status);
  return normalizeRegistry(await res.json());
}
