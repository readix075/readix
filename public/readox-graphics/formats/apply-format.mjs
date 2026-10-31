/** Readox — Changement de format : stratégies (cahier v5.2 §5.1, T12/T22).
 * Trois stratégies explicites, jamais de déformation silencieuse :
 *  - `adapter`    : mise à l'échelle UNIFORME centrée (ratio préservé, aucune déformation) ;
 *  - `recadrer`   : page redimensionnée, objets inchangés ; les objets hors limites
 *                   sont signalés dans le rapport (confirmation requise côté UI) ;
 *  - `recomposer` : exige des contraintes de scène ; sans solveur de contraintes,
 *                   refuse honnêtement (REFLOW_REQUIRES_CONSTRAINT_SOLVER).
 * La géométrie de calcul est partagée avec gf05d/geometry.resizePage (réutilisation,
 * pas de duplication). Fonctions pures, testables sous Node.
 */

import { resizePage } from '../gf05d/geometry.mjs';

export const STRATEGIES = Object.freeze([
  { id: 'adapter', label: 'Adapter sans déformer', description: 'Mise à l\'échelle uniforme centrée : aucune distorsion des photos ni du texte.' },
  { id: 'recadrer', label: 'Recadrer', description: 'La page change de dimensions ; les objets gardent leur position. Les débordements sont signalés.' },
  { id: 'recomposer', label: 'Recomposer avec contraintes', description: 'Nécessite des contraintes de scène ; indisponible pour les documents sans contraintes.' }
]);

const MODE = { adapter: 'scale', recadrer: 'crop', recomposer: 'reflow' };

/** Plan de changement de format. Lève FORMAT_STRATEGY_UNKNOWN ou REFLOW_REQUIRES_CONSTRAINT_SOLVER. */
export function planFormatChange(from, to, strategy = 'adapter') {
  if (!STRATEGIES.some(s => s.id === strategy)) throw Error('FORMAT_STRATEGY_UNKNOWN:' + strategy);
  const result = resizePage({ width: from.width, height: from.height }, to.width, to.height, MODE[strategy]);
  if (!result.supported) throw Error(result.code);
  return { strategy, scale: result.scale, dx: result.dx, dy: result.dy, width: result.width, height: result.height };
}

/** Applique un plan à des items legacy (nouveaux objets, entrée intacte).
 * adapter : géométrie et tailles de texte mises à l'échelle uniformément (arrondi 0,01) ;
 * recadrer : identité. */
export function transformItems(items, plan) {
  const r2 = v => Math.round(v * 100) / 100;
  return items.map(it => {
    const n = { ...it };
    if (plan.strategy === 'adapter') {
      n.x = r2(it.x * plan.scale + plan.dx);
      n.y = r2(it.y * plan.scale + plan.dy);
      n.w = r2(it.w * plan.scale);
      n.h = r2(it.h * plan.scale);
      if (typeof it.size === 'number') n.size = Math.max(4, r2(it.size * plan.scale));
    }
    return n;
  });
}

/** Objets débordant les nouvelles limites (rapport de recadrage, T22). */
export function overflowReport(items, width, height) {
  return items
    .filter(it => it.x < 0 || it.y < 0 || it.x + it.w > width || it.y + it.h > height)
    .map(it => ({ id: it.id, type: it.type, overflow: {
      left: Math.max(0, -it.x), top: Math.max(0, -it.y),
      right: Math.max(0, it.x + it.w - width), bottom: Math.max(0, it.y + it.h - height)
    } }));
}

/** Changement de format complet sur un document legacy {items, page, pageBg, ...}.
 * Retourne { doc, report } — doc est une copie, l'entrée n'est jamais mutée. */
export function applyFormatToDoc(doc, target, strategy = 'adapter') {
  const from = { width: doc.page?.width || 510, height: doc.page?.height || 660 };
  const plan = planFormatChange(from, target, strategy);
  const items = transformItems(doc.items || [], plan);
  const report = {
    strategy, from, to: { width: plan.width, height: plan.height },
    scale: plan.scale, distorted: false,
    overflow: strategy === 'recadrer' ? overflowReport(items, plan.width, plan.height) : []
  };
  return { doc: { ...doc, items, page: { width: plan.width, height: plan.height, background: doc.page?.background || doc.pageBg || '#ffffff' } }, report };
}
