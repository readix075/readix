/** Readox — Registre unique des formats documentaires (cahier v5.2 §5.2, §5.3, T19/T20/T21).
 * Source unique lue par le sélecteur UI et par les commandes canoniques :
 * aucune constante de format dupliquée dans l'HTML.
 * Contrat §5.3 par preset : ID stable, noms FR/EN, dimensions, unité, orientation,
 * ratio, DPI recommandé, marges, fond perdu, safe area, grille conseillée,
 * compatibilité d'export, version, source et date de revue.
 * Les dimensions sont exprimées dans `unit` (mm pour l'impression ISO 216,
 * px pour les presets plateformes). Le DPI recommandé est un paramètre de
 * rasterisation/export, jamais un gain magique de résolution.
 */

import { dimsToPx, DPI_CSS } from './units.mjs';

export const FORMAT_REGISTRY_VERSION = '1.0.0';
export const FORMAT_REGISTRY_REVIEWED = '2026-10-31';

const mm = (width, height, extra = {}) => ({ width, height, unit: 'mm', ...extra });
const px = (width, height, extra = {}) => ({ width, height, unit: 'px', ...extra });

function preset(id, family, nameFr, nameEn, dims, extra = {}) {
  return {
    id, family,
    name: { fr: nameFr, en: nameEn },
    ...dims,
    orientation: 'portrait',
    orientations: ['portrait', 'paysage'],
    ratio: +(dims.width / dims.height).toFixed(4),
    recommendedDpi: 300,
    margins: { top: 5, right: 5, bottom: 5, left: 5, unit: 'mm' },
    bleed: { value: 3, unit: 'mm' },
    safeArea: { inset: 5, unit: 'mm' },
    grid: { columns: 12, gutter: 4, unit: 'mm' },
    export: ['png', 'jpg', 'pdf', 'svg'],
    version: FORMAT_REGISTRY_VERSION,
    source: extra.source || 'readox-format-registry',
    lastReviewed: FORMAT_REGISTRY_REVIEWED,
    ...extra
  };
}

export const FORMATS = Object.freeze([
  // — Impression ISO 216 (dimensions officielles en mm) —
  preset('iso-a6', 'impression-iso', 'A6', 'A6', mm(105, 148), { source: 'ISO 216' }),
  preset('iso-a5', 'impression-iso', 'A5', 'A5', mm(148, 210), { source: 'ISO 216' }),
  preset('iso-a4', 'impression-iso', 'A4', 'A4', mm(210, 297), { source: 'ISO 216' }),
  preset('iso-a3', 'impression-iso', 'A3', 'A3', mm(297, 420), { source: 'ISO 216' }),
  preset('iso-a2', 'impression-iso', 'A2', 'A2', mm(420, 594), { source: 'ISO 216' }),
  // — Affiches —
  preset('poster-2-3', 'affiches', 'Affiche 2:3', 'Poster 2:3', px(600, 900)),
  preset('poster-3-4', 'affiches', 'Affiche 3:4', 'Poster 3:4', px(600, 800)),
  preset('poster-4-5', 'affiches', 'Affiche 4:5', 'Poster 4:5', px(800, 1000)),
  // — Réseaux sociaux (presets versionnés, sujets à évolution plateforme) —
  preset('social-carre-1-1', 'reseaux-sociaux', 'Carré 1:1', 'Square 1:1', px(1080, 1080), { recommendedDpi: 96, source: 'preset-plateforme', bleed: { value: 0, unit: 'px' } }),
  preset('social-portrait-4-5', 'reseaux-sociaux', 'Portrait 4:5', 'Portrait 4:5', px(1080, 1350), { recommendedDpi: 96, source: 'preset-plateforme', bleed: { value: 0, unit: 'px' } }),
  preset('social-story-9-16', 'reseaux-sociaux', 'Story 9:16', 'Story 9:16', px(1080, 1920), { recommendedDpi: 96, source: 'preset-plateforme', bleed: { value: 0, unit: 'px' } }),
  preset('social-paysage-16-9', 'reseaux-sociaux', 'Paysage 16:9', 'Landscape 16:9', px(1920, 1080), { orientation: 'paysage', recommendedDpi: 96, source: 'preset-plateforme', bleed: { value: 0, unit: 'px' } }),
  // — Présentations —
  preset('presentation-16-9', 'presentations', 'Présentation 16:9', 'Presentation 16:9', px(1920, 1080), { orientation: 'paysage', recommendedDpi: 96, bleed: { value: 0, unit: 'px' } }),
  preset('presentation-4-3', 'presentations', 'Présentation 4:3', 'Presentation 4:3', px(1440, 1080), { orientation: 'paysage', recommendedDpi: 96, bleed: { value: 0, unit: 'px' } }),
  // — Marketing —
  preset('marketing-carte-visite', 'marketing', 'Carte de visite', 'Business card', mm(85, 55), { orientation: 'paysage' }),
  preset('marketing-banniere', 'marketing', 'Bannière web', 'Web banner', px(2000, 500), { orientation: 'paysage', recommendedDpi: 96, bleed: { value: 0, unit: 'px' } })
]);

const BY_ID = new Map(FORMATS.map(f => [f.id, f]));

export function getFormat(id) { return BY_ID.get(id) || null; }

/** Format 'custom' : dimensions libres {width, height, unit} validées. */
export function customFormat({ width, height, unit = 'px' }) {
  const w = Number(width), h = Number(height);
  if (!(Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0)) throw Error('FORMAT_CUSTOM_INVALID');
  return preset('custom', 'personnalise', 'Personnalisé', 'Custom', { width: w, height: h, unit });
}

/** Dimensions px entières d'un preset pour la scène, à l'orientation demandée. */
export function formatDimsPx(format, orientation = 'portrait', dpi = DPI_CSS) {
  const f = typeof format === 'string' ? getFormat(format) : format;
  if (!f) throw Error('FORMAT_UNKNOWN:' + format);
  let { width, height } = dimsToPx(f, dpi);
  if (orientation === 'paysage' && height > width) [width, height] = [height, width];
  if (orientation === 'portrait' && width > height) [width, height] = [height, width];
  return { width, height, orientation };
}

/** Détecte un preset correspondant à des dimensions px (±1 px), toute orientation. */
export function detectFormat(widthPx, heightPx, dpi = DPI_CSS) {
  for (const f of FORMATS) {
    for (const o of f.orientations) {
      const d = formatDimsPx(f, o, dpi);
      if (Math.abs(d.width - widthPx) <= 1 && Math.abs(d.height - heightPx) <= 1) return { format: f, orientation: o };
    }
  }
  return null;
}
