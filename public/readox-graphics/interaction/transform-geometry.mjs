/** Phase 3 (cahier v5.2 §6.2) — Géométrie pure des transformations interactives.
 * Aucune dépendance DOM : toutes les fonctions sont testables en Node.
 * Repères : les items vivent en unités page (px CSS à 96 dpi), rotation en degrés
 * horaires autour du centre. Les poignées sont dans le repère LOCAL de l'objet
 * (non tourné) ; la conversion écran → local passe par toLocalDelta. */

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const MIN_SIZE = 20; // aucune largeur/hauteur négative (§6.2)

/** Position locale d'une poignée dans le repère centré (coin nw = (-w/2,-h/2)). */
export function handleLocal(handle, w, h) {
  const x = handle.includes('w') ? -w / 2 : handle.includes('e') ? w / 2 : 0;
  const y = handle.includes('n') ? -h / 2 : handle.includes('s') ? h / 2 : 0;
  return { x, y };
}

/** Poignée opposée (point fixe du redimensionnement). */
export function oppositeHandle(handle) {
  const flip = { n: 's', s: 'n', e: 'w', w: 'e' };
  return handle.split('').map(c => flip[c]).join('');
}

/** Rotation d'un vecteur de θ degrés (horaire, y vers le bas). */
export function rot(v, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Delta écran (px CSS) → delta local page : division par l'échelle de zoom puis rotation de -θ.
 * Aucune dérive au zoom : la division utilise l'échelle réelle mesurée. */
export function toLocalDelta(dxScreen, dyScreen, scale, rotationDeg = 0) {
  const v = { x: dxScreen / scale, y: dyScreen / scale };
  return rotationDeg ? rot(v, -rotationDeg) : v;
}

/** Redimensionnement par poignée, avec point fixe exact même sous rotation.
 * initial : {x,y,w,h,rotation}. handle : nw..w. d : delta LOCAL page (déjà tourné).
 * opts : { minW, minH, lockRatio, fromCenter }.
 * Retour : nouveau {x,y,w,h} (non arrondi), tel que la poignée opposée est fixe
 * en coordonnées page (centre fixe si fromCenter). */
export function applyHandleDrag(initial, handle, d, opts = {}) {
  const minW = opts.minW ?? MIN_SIZE, minH = opts.minH ?? MIN_SIZE;
  const ratio = initial.w / initial.h;
  let { w, h } = initial;
  // Application locale : le bord tenu suit le delta.
  const growE = handle.includes('e'), growW = handle.includes('w');
  const growS = handle.includes('s'), growN = handle.includes('n');
  if (growE) w = initial.w + d.x;
  if (growW) w = initial.w - d.x;
  if (growS) h = initial.h + d.y;
  if (growN) h = initial.h - d.y;
  if (opts.lockRatio && (growE || growW) && (growS || growN)) {
    // Coin : conserve le ratio, la plus grande variation relative commande.
    const kw = w / initial.w, kh = h / initial.h;
    const k = Math.abs(kw - 1) > Math.abs(kh - 1) ? kw : kh;
    w = initial.w * k; h = initial.h * k;
  }
  if (opts.fromCenter) { // Alt/Option : redimensionnement symétrique autour du centre
    if (growE || growW) w = initial.w + 2 * (growE ? d.x : -d.x);
    if (growS || growN) h = initial.h + 2 * (growS ? d.y : -d.y);
    if (opts.lockRatio && (growE || growW) && (growS || growN)) { h = w / ratio; }
  }
  w = Math.max(minW, w); h = Math.max(minH, h);
  if (opts.lockRatio && (growE || growW) && (growS || growN)) h = w / ratio;
  // Recalage : la poignée opposée (ou le centre) reste fixe en coordonnées page.
  const theta = initial.rotation || 0;
  const C = { x: initial.x + initial.w / 2, y: initial.y + initial.h / 2 };
  if (opts.fromCenter || theta === 0) {
    if (opts.fromCenter) return { x: C.x - w / 2, y: C.y - h / 2, w, h };
    // θ = 0 : translation directe du coin opposé.
    let x = initial.x, y = initial.y;
    if (growW) x = initial.x + initial.w - w;
    if (growN) y = initial.y + initial.h - h;
    return { x, y, w, h };
  }
  const fOld = handleLocal(oppositeHandle(handle), initial.w, initial.h);
  const fNew = handleLocal(oppositeHandle(handle), w, h);
  const F = { x: C.x + rot(fOld, theta).x, y: C.y + rot(fOld, theta).y };
  const Cn = { x: F.x - rot(fNew, theta).x, y: F.y - rot(fNew, theta).y };
  return { x: Cn.x - w / 2, y: Cn.y - h / 2, w, h };
}

/** Rotation depuis le pointeur : angle autour du centre (degrés, arrondi à l'entier,
 * snap à snapDeg si > 0, ex. 15° avec Maj). */
export function rotationFromPointer(centerScreen, startScreen, curScreen, startRotation, snapDeg = 0) {
  const a0 = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
  const a1 = Math.atan2(curScreen.y - centerScreen.y, curScreen.x - centerScreen.x);
  let deg = startRotation + (a1 - a0) * 180 / Math.PI;
  if (snapDeg > 0) deg = Math.round(deg / snapDeg) * snapDeg;
  deg = Math.round(deg);
  return ((deg % 360) + 360) % 360;
}

/** Cibles de snap dynamiques : bords et centre de page (géométrie courante) +
 * bords et centres des autres objets. Corrige les cibles historiques codées à 510. */
export function snapTargetsFor(items, excludeId, pageW, pageH) {
  const other = items.filter(v => v.id !== excludeId);
  return {
    x: [0, pageW / 2, pageW, ...other.flatMap(v => [v.x, v.x + v.w / 2, v.x + v.w])],
    y: [0, pageH / 2, pageH, ...other.flatMap(v => [v.y, v.y + v.h / 2, v.y + v.h])],
  };
}

/** Snap le plus proche parmi les bords/centres candidats. tolerance en unités page
 * (l'appelant divise la tolérance écran par l'échelle de zoom). */
export function snapDelta(candidates, targets, tolerance) {
  let best = null;
  for (const c of candidates) for (const t of targets) {
    const delta = t - c;
    if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, target: t };
  }
  return best;
}

/** Snap d'un redimensionnement : ne s'applique qu'aux objets non tournés
 * (guides alignés axes — chemin θ=0 inchangé, voir snapResizeRotated pour θ≠0). */
export function snapResize(rect, handle, targets, tolerance) {
  const candX = [], candY = [];
  if (handle.includes('w')) candX.push(rect.x);
  if (handle.includes('e')) candX.push(rect.x + rect.w);
  if (handle.includes('n')) candY.push(rect.y);
  if (handle.includes('s')) candY.push(rect.y + rect.h);
  const sx = candX.length ? snapDelta(candX, targets.x, tolerance) : null;
  const sy = candY.length ? snapDelta(candY, targets.y, tolerance) : null;
  let { x, y, w, h } = rect;
  if (sx) { if (handle.includes('w')) { x += sx.delta; w -= sx.delta; } else w += sx.delta; }
  if (sy) { if (handle.includes('n')) { y += sy.delta; h -= sy.delta; } else h += sy.delta; }
  return { rect: { x, y, w, h }, guideX: sx?.target ?? null, guideY: sy?.target ?? null };
}

/** Point page d'une poignée d'un rectangle tourné de θ autour de son centre. */
export function handlePagePoint(rect, handle, rotationDeg = 0) {
  const C = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const p = rot(handleLocal(handle, rect.w, rect.h), rotationDeg);
  return { x: C.x + p.x, y: C.y + p.y };
}

/** Snap d'un redimensionnement SOUS ROTATION (P3-L1) — repères objet et document.
 * Le point page de la poignée déplacée est attiré par la cible x/y la plus proche
 * (bords/centres de page + objets voisins, voir snapTargetsFor) :
 * - poignée coin (2 DDL) : correction locale exacte δL = R(−θ)·δpage — la poignée
 *   atteint la cible en x et/ou y, l'autre axe restant collé au pointeur ;
 * - poignée milieu (1 DDL) : projection sur la direction autorisée — l'axe choisi
 *   (le moins coûteux) est atteint exactement, l'autre suit la contrainte géométrique ;
 * - verrou de ratio (coin) : résolution linéaire exacte en facteur d'échelle k —
 *   le point fixe F est indépendant de k, donc P(k) = F + k·R(θ)·v est affine ;
 *   le ratio strict prime toujours sur le snap (§6.2) ;
 * - fromCenter (Alt) : sensibilité identique (le déplacement de poignée vaut la
 *   moitié du Δ de taille et la taille croît de 2×, soit 1:1), point fixe = centre.
 * Le point fixe (poignée opposée ou centre) et l'angle sont préservés dans tous
 * les cas. tolerance est en unités page (l'appelant divise la tolérance écran
 * par l'échelle de zoom — comportement identique à 25/100/200 %). */
export function snapResizeRotated(initial, handle, d, targets, tolerance, opts = {}) {
  const theta = initial.rotation || 0;
  const r0 = applyHandleDrag(initial, handle, d, opts);
  const P0 = handlePagePoint(r0, handle, theta);
  const sx = snapDelta([P0.x], targets.x, tolerance);
  const sy = snapDelta([P0.y], targets.y, tolerance);
  if (!sx && !sy) return { rect: r0, guideX: null, guideY: null };
  const corner = handle.length === 2, EPS = 1e-6;
  const ratio0 = initial.w / initial.h;
  if (opts.lockRatio && corner) {
    // Rect final = k·(w0,h0) ; F (point fixe) ne dépend pas de k → résolution exacte.
    const w0 = initial.w, h0 = initial.h;
    const C0 = { x: initial.x + w0 / 2, y: initial.y + h0 / 2 };
    const sgnPX = handle.includes('w') ? -1 : 1, sgnPY = handle.includes('n') ? -1 : 1;
    const rv = rot({ x: sgnPX * w0, y: sgnPY * h0 }, theta); // P − F = k·rv
    const F = opts.fromCenter ? C0 : (() => {
      const fOld = handleLocal(oppositeHandle(handle), w0, h0);
      return { x: C0.x + rot(fOld, theta).x, y: C0.y + rot(fOld, theta).y };
    })();
    const cands = [];
    if (sx && Math.abs(rv.x) > EPS) cands.push({ k: (sx.target - F.x) / rv.x, axis: 'x', target: sx.target });
    if (sy && Math.abs(rv.y) > EPS) cands.push({ k: (sy.target - F.y) / rv.y, axis: 'y', target: sy.target });
    if (!cands.length) return { rect: r0, guideX: null, guideY: null };
    const kCur = r0.w / w0;
    cands.sort((a, b) => Math.abs(a.k - kCur) - Math.abs(b.k - kCur));
    const chosen = cands[0];
    const w = Math.max(opts.minW ?? MIN_SIZE, w0 * chosen.k); // taille mini : jamais de dimension négative
    const h = w / ratio0; // le ratio strict prime sur le snap (et sur minH)
    const fNew = handleLocal(oppositeHandle(handle), w, h);
    const Cn = opts.fromCenter ? C0 : { x: F.x - rot(fNew, theta).x, y: F.y - rot(fNew, theta).y };
    return { rect: { x: Cn.x - w / 2, y: Cn.y - h / 2, w, h },
             guideX: chosen.axis === 'x' ? chosen.target : null,
             guideY: chosen.axis === 'y' ? chosen.target : null };
  }
  if (!corner) {
    // Milieu : une direction autorisée u (page). Cible atteignable la moins coûteuse.
    const alongX = handle.includes('e') || handle.includes('w');
    const u = rot(alongX ? { x: 1, y: 0 } : { x: 0, y: 1 }, theta);
    const cands = [];
    if (sx && Math.abs(u.x) > 0.05) cands.push({ s: sx.delta / u.x, axis: 'x', target: sx.target });
    if (sy && Math.abs(u.y) > 0.05) cands.push({ s: sy.delta / u.y, axis: 'y', target: sy.target });
    if (!cands.length) return { rect: r0, guideX: null, guideY: null };
    cands.sort((a, b) => Math.abs(a.s) - Math.abs(b.s));
    const chosen = cands[0];
    const d2 = alongX ? { x: d.x + chosen.s, y: d.y } : { x: d.x, y: d.y + chosen.s };
    const rect = applyHandleDrag(initial, handle, d2, opts);
    return { rect, guideX: chosen.axis === 'x' ? chosen.target : null, guideY: chosen.axis === 'y' ? chosen.target : null };
  }
  // Coin sans verrou : correction locale exacte des deux axes.
  const dl = rot({ x: sx ? sx.delta : 0, y: sy ? sy.delta : 0 }, -theta);
  const rect = applyHandleDrag(initial, handle, { x: d.x + dl.x, y: d.y + dl.y }, opts);
  return { rect, guideX: sx?.target ?? null, guideY: sy?.target ?? null };
}

// — Recadrage photo : fenêtre visible en fractions {l,t,r,b} de l'image affichée —
export const CROP_MIN_VISIBLE = 0.1; // au moins 10 % de l'image reste visible

export function defaultCrop() { return { l: 0, t: 0, r: 0, b: 0 }; }

export function normalizeCrop(c) {
  if (!c || typeof c !== 'object') return defaultCrop();
  const cl = v => Math.max(0, Math.min(1 - CROP_MIN_VISIBLE, Number(v) || 0));
  let { l, t, r, b } = { l: cl(c.l), t: cl(c.t), r: cl(c.r), b: cl(c.b) };
  if (l + r > 1 - CROP_MIN_VISIBLE) r = 1 - CROP_MIN_VISIBLE - l;
  if (t + b > 1 - CROP_MIN_VISIBLE) b = 1 - CROP_MIN_VISIBLE - t;
  return { l, t, r, b };
}

/** Déplacement d'une poignée de recadrage de (dx,dy) unités page dans un cadre w×h. */
export function applyCropDrag(crop, handle, dx, dy, frameW, frameH) {
  const c = { ...normalizeCrop(crop) };
  if (handle.includes('e')) c.r += -dx / frameW;
  if (handle.includes('w')) c.l += dx / frameW;
  if (handle.includes('s')) c.b += -dy / frameH;
  if (handle.includes('n')) c.t += dy / frameH;
  return normalizeCrop(c);
}

/** Style de l'<img> recadrée dans un cadre w×h : image agrandie et décalée,
 * le conteneur (overflow:hidden) joue le rôle de fenêtre. */
export function cropImgStyle(crop, w, h) {
  const c = normalizeCrop(crop);
  const iw = w / (1 - c.l - c.r), ih = h / (1 - c.t - c.b);
  return { width: iw, height: ih, left: -c.l * iw, top: -c.t * ih };
}

/** Métriques temps réel (§6.2) : valeurs canoniques px + distances aux bords. */
export function metricsFor(it, pageW, pageH) {
  return {
    x: it.x, y: it.y, w: it.w, h: it.h,
    rotation: Number(it.rotation) || 0,
    ratio: it.h !== 0 ? it.w / it.h : 0,
    marges: { l: it.x, t: it.y, r: pageW - (it.x + it.w), b: pageH - (it.y + it.h) },
  };
}

/** Ratio réduit textuel, ex. 1,78:1 (ou entier si proche, ex. 16:9 → 1,78:1). */
export function ratioLabel(w, h) {
  if (!h) return '—';
  const r = w / h;
  return `${r.toFixed(2).replace('.', ',')}:1`;
}
