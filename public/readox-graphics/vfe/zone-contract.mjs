/** VFE — Contrat de zones pour affiches professionnelles (cahier des charges §2, §3, §5).
 * Définit la structure attendue d'une affiche 1024×1536 (zones Z00–Z08),
 * les préfixes d'identifiants, les rôles de ressources requis et les
 * relations d'exemption de collision (chevauchements intentionnels).
 *
 * Ce module NE CONSTRUIT AUCUN modèle : il fournit le contrat que la
 * reconstruction future (FORNO VIVO, lot E, réalisée séparément) devra
 * satisfaire, et le validateur qui le vérifiera. Les rectangles sont les
 * boîtes de départ estimées du cahier des charges — à remesurer sur le crop
 * approuvé avant fixation définitive.
 */

export const POSTER_FORMAT = Object.freeze({ width: 1024, height: 1536, dpi: 300, unit: 'px' });

export const ZONES = Object.freeze([
  { id: 'Z00', role: 'background', rect: { x: 0, y: 0, width: 1024, height: 1536 }, prefixes: ['BG-'], requiresAssets: [{ role: 'photo-background', kind: 'image', critical: true }], estimated: true },
  { id: 'Z01', role: 'brand', rect: { x: 65, y: 45, width: 610, height: 500 }, prefixes: ['LOGO-', 'TITLE-'], requiresAssets: [{ role: 'font-display', kind: 'font', critical: true }], estimated: true },
  { id: 'Z02', role: 'slogan', rect: { x: 625, y: 150, width: 355, height: 330 }, prefixes: ['SLOGAN-'], requiresAssets: [{ role: 'font-script', kind: 'font', critical: false }], estimated: true },
  { id: 'Z03', role: 'promotion', rect: { x: 10, y: 535, width: 425, height: 385 }, prefixes: ['PROMO-'], requiresAssets: [{ role: 'texture-brush', kind: 'texture', critical: true }], estimated: true },
  { id: 'Z04', role: 'hero-photo', rect: { x: 245, y: 480, width: 760, height: 570 }, prefixes: ['HERO-'], requiresAssets: [{ role: 'photo-hero', kind: 'image', critical: true }, { role: 'mask-hero', kind: 'mask', critical: false }, { role: 'effect-steam', kind: 'effect', critical: false }], estimated: true, critical: true },
  { id: 'Z05', role: 'banner', rect: { x: 40, y: 1025, width: 945, height: 75 }, prefixes: ['BAND-'], requiresAssets: [], estimated: true },
  { id: 'Z06', role: 'arguments', rect: { x: 55, y: 1100, width: 915, height: 205 }, prefixes: ['ARG-'], requiresAssets: [{ role: 'icon-set', kind: 'icon', critical: false }], estimated: true },
  { id: 'Z07', role: 'cta', rect: { x: 150, y: 1310, width: 720, height: 100 }, prefixes: ['CTA-'], requiresAssets: [], estimated: true },
  { id: 'Z08', role: 'footer', rect: { x: 35, y: 1410, width: 960, height: 105 }, prefixes: ['FOOT-'], requiresAssets: [{ role: 'icon-social', kind: 'icon', critical: false }], estimated: true }
]);

const intersects = (a, b) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
  Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

const nodeRect = n => ({ x: n.geometry?.x ?? 0, y: n.geometry?.y ?? 0, width: n.geometry?.width ?? 0, height: n.geometry?.height ?? 0 });

/** Relation explicite exemptant un chevauchement intentionnel (ex. promo devant pizza). */
export function intentionalOverlap(fromId, toId) {
  return { id: `overlap-${fromId}-${toId}`, type: 'overlayOf', from: fromId, to: toId };
}

/**
 * Validation de couverture des zones d'un document canonique.
 * Retourne pour chaque zone : nœuds trouvés, ressources requises présentes
 * ou manquantes (via le manifeste fourni), statut. Ne modifie rien.
 */
export function validateZoneCoverage(doc, { zones = ZONES, assetManager = null } = {}) {
  const page = doc.pages?.[0];
  const results = [];
  for (const zone of zones) {
    const nodes = Object.values(doc.nodes || {}).filter(n =>
      zone.prefixes.some(p => String(n.id).startsWith(p)) || intersects(nodeRect(n), zone.rect) && n.role === zone.role
    );
    const byPrefix = Object.values(doc.nodes || {}).filter(n => zone.prefixes.some(p => String(n.id).startsWith(p)));
    const assets = [];
    for (const req of zone.requiresAssets) {
      let found = null;
      if (assetManager) {
        found = assetManager.list().find(a => a.role === req.role && a.kind === req.kind) || null;
      } else {
        found = Object.values(doc.assets || {}).find(a => a.role === req.role && a.kind === req.kind) || null;
      }
      assets.push({
        ...req,
        assetId: found?.id || null,
        status: found ? found.status : 'missing_asset',
        satisfied: !!found && found.status === 'available'
      });
    }
    const missingCritical = assets.filter(a => a.critical && !a.satisfied);
    results.push({
      zone: zone.id,
      role: zone.role,
      estimated: zone.estimated,
      nodeCount: byPrefix.length,
      nodes: byPrefix.map(n => n.id),
      assets,
      status: missingCritical.length ? 'blocked' : byPrefix.length ? 'covered' : 'empty',
      blocking: missingCritical.map(a => ({ code: 'ZONE_ASSET_MISSING', zone: zone.id, role: a.role }))
    });
  }
  const formatOk = page && page.width === POSTER_FORMAT.width && page.height === POSTER_FORMAT.height;
  return {
    version: 'VFE-ZONES-1',
    format: { expected: POSTER_FORMAT, actual: page ? { width: page.width, height: page.height } : null, ok: !!formatOk },
    zones: results,
    conforme: !!formatOk && results.every(z => z.status !== 'blocked'),
    note: 'Rectangles estimatifs (cahier §2) : à remesurer sur le crop approuvé.'
  };
}

/** Exigences de nommage pour la reconstruction : aide à produire des nœuds conformes. */
export function namingContract() {
  return ZONES.map(z => ({ zone: z.id, role: z.role, prefixes: z.prefixes, assets: z.requiresAssets.map(a => `${a.kind}:${a.role}${a.critical ? ' (critique)' : ''}`) }));
}
