/** Readox — Unités documentaires (cahier v5.2 §5.2, T14).
 * Conversions exactes : 1 in = 25,4 mm ; 1 pt = 1/72 in ; 1 pica = 12 pt ; 1 cm = 10 mm.
 * Le px est l'unité canonique de la scène ; le DPI (96 par défaut, convention CSS)
 * n'intervient que pour la rasterisation/export — jamais pour inventer de la résolution.
 * Fonctions pures, testables sous Node et navigateur.
 */

export const DPI_CSS = 96;
export const MM_PER_IN = 25.4;
export const PT_PER_IN = 72;
export const PT_PER_PICA = 12;

export const UNITS = Object.freeze(['px', 'mm', 'cm', 'in', 'pt', 'pica']);

/** Facteur exact d'entrée vers les millimètres. */
const TO_MM = { mm: 1, cm: 10, in: MM_PER_IN, pt: MM_PER_IN / PT_PER_IN, pica: MM_PER_IN * PT_PER_PICA / PT_PER_IN };

export function isUnit(u) { return u === 'px' || Object.hasOwn(TO_MM, u); }

/** Valeur → px à un DPI donné. Arrondi explicite et documenté : 0,01 px près. */
export function toPx(value, unit = 'px', dpi = DPI_CSS) {
  const v = Number(value);
  if (!Number.isFinite(v)) throw Error('UNIT_VALUE_INVALID');
  if (!isUnit(unit)) throw Error('UNIT_UNKNOWN:' + unit);
  if (!(Number.isFinite(dpi) && dpi > 0)) throw Error('DPI_INVALID');
  if (unit === 'px') return v;
  return v * TO_MM[unit] / MM_PER_IN * dpi;
}

/** px → unité cible à un DPI donné. */
export function fromPx(px, unit = 'px', dpi = DPI_CSS) {
  const v = Number(px);
  if (!Number.isFinite(v)) throw Error('UNIT_VALUE_INVALID');
  if (!isUnit(unit)) throw Error('UNIT_UNKNOWN:' + unit);
  if (!(Number.isFinite(dpi) && dpi > 0)) throw Error('DPI_INVALID');
  if (unit === 'px') return v;
  return v * MM_PER_IN / dpi / TO_MM[unit];
}

/** Conversion directe unité → unité (passe par le px à dpi donné). */
export function convert(value, from, to, dpi = DPI_CSS) {
  return fromPx(toPx(value, from, dpi), to, dpi);
}

/** Dimensions {width, height, unit} → px entiers (scène) à dpi donné.
 * Arrondi au px le plus proche, minimum 1 px ; l'écart maximal induit est de 0,5 px. */
export function dimsToPx(dim, dpi = DPI_CSS) {
  if (!dim || typeof dim !== 'object') throw Error('DIMS_INVALID');
  return {
    width: Math.max(1, Math.round(toPx(dim.width, dim.unit || 'px', dpi))),
    height: Math.max(1, Math.round(toPx(dim.height, dim.unit || 'px', dpi)))
  };
}

/** Dimensions px → unité d'affichage, arrondies à `digits` décimales. */
export function dimsFromPx(width, height, unit = 'mm', dpi = DPI_CSS, digits = 2) {
  const r = v => Number(v.toFixed(digits));
  return { width: r(fromPx(width, unit, dpi)), height: r(fromPx(height, unit, dpi)), unit, dpi };
}
