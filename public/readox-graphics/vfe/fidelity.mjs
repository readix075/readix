/** VFE — Moteur de comparaison visuelle (cahier des charges §8, T30, T37).
 * Opère sur des tampons RGBA {width,height,data:Uint8ClampedArray} — donc
 * testable sous Node avec des images synthétiques et utilisable dans le
 * navigateur avec des captures canvas. Aucun seuil n'est inventé : les seuils
 * sont passés en paramètre et tracés dans le rapport.
 *
 * Mesures par zone et globales :
 *  - MAE et pourcentage de pixels différents (tolérance paramétrable) ;
 *  - deltaE76 (RGB -> Lab) moyen et maximal ;
 *  - SSIM fenêtré 8×8 (luminance) ;
 *  - heatmap RGBA des écarts pour inspection visuelle.
 * Priorités : P0 = dimensions/ratio/export corrompu ; P1 = géométrie/couleur ;
 * P2 = texture fine. Un score global élevé ne masque jamais une zone critique.
 */

const srgb2lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function rgb2lab(r, g, b) {
  const R = srgb2lin(r), G = srgb2lin(g), B = srgb2lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function deltaE76(p, q) {
  const [L1, a1, b1] = rgb2lab(p[0], p[1], p[2]);
  const [L2, a2, b2] = rgb2lab(q[0], q[1], q[2]);
  return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

export function checkDimensions(ref, render, expected = null) {
  const problems = [];
  if (ref.width !== render.width || ref.height !== render.height) {
    problems.push({ code: 'DIMENSION_MISMATCH', ref: [ref.width, ref.height], render: [render.width, render.height], priority: 'P0' });
  }
  if (expected && (render.width !== expected.width || render.height !== expected.height)) {
    problems.push({ code: 'EXPECTED_SIZE_MISMATCH', expected: [expected.width, expected.height], render: [render.width, render.height], priority: 'P0' });
  }
  const rr = render.width / render.height;
  if (expected && Math.abs(rr - expected.width / expected.height) > 0.005) {
    problems.push({ code: 'RATIO_MISMATCH', ratio: rr, priority: 'P0' });
  }
  return problems;
}

/** Statistiques d'écart sur une zone rectangulaire. */
export function zoneStats(ref, render, zone, { pixelTolerance = 8 } = {}) {
  const x0 = Math.max(0, Math.floor(zone.x)), y0 = Math.max(0, Math.floor(zone.y));
  const x1 = Math.min(ref.width, Math.ceil(zone.x + zone.width));
  const y1 = Math.min(ref.height, Math.ceil(zone.y + zone.height));
  if (x1 <= x0 || y1 <= y0) return { zone: zone.id, valid: false, code: 'ZONE_OUT_OF_BOUNDS' };
  let n = 0, mae = 0, diff = 0, sumDE = 0, maxDE = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * ref.width + x) * 4;
      const dr = Math.abs(ref.data[i] - render.data[i]);
      const dg = Math.abs(ref.data[i + 1] - render.data[i + 1]);
      const db = Math.abs(ref.data[i + 2] - render.data[i + 2]);
      mae += (dr + dg + db) / 3;
      if (Math.max(dr, dg, db) > pixelTolerance) diff++;
      const dE = deltaE76([ref.data[i], ref.data[i + 1], ref.data[i + 2]], [render.data[i], render.data[i + 1], render.data[i + 2]]);
      sumDE += dE; if (dE > maxDE) maxDE = dE;
      n++;
    }
  }
  return {
    zone: zone.id, valid: true, pixels: n,
    mae: +(mae / n).toFixed(3),
    pixelDiffPct: +(100 * diff / n).toFixed(3),
    meanDeltaE: +(sumDE / n).toFixed(3),
    maxDeltaE: +maxDE.toFixed(3)
  };
}

/** SSIM simplifié sur fenêtres 8×8 (luminance), moyenné. */
export function ssim(ref, render, { windowSize = 8 } = {}) {
  const w = Math.min(ref.width, render.width), h = Math.min(ref.height, render.height);
  const lum = (img, x, y) => { const i = (y * img.width + x) * 4; return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; };
  const C1 = 6.5025, C2 = 58.5225;
  let total = 0, count = 0;
  for (let y0 = 0; y0 + windowSize <= h; y0 += windowSize) {
    for (let x0 = 0; x0 + windowSize <= w; x0 += windowSize) {
      let m1 = 0, m2 = 0;
      const L1 = [], L2 = [];
      for (let dy = 0; dy < windowSize; dy++) for (let dx = 0; dx < windowSize; dx++) {
        const a = lum(ref, x0 + dx, y0 + dy), b = lum(render, x0 + dx, y0 + dy);
        L1.push(a); L2.push(b); m1 += a; m2 += b;
      }
      const N = L1.length; m1 /= N; m2 /= N;
      let v1 = 0, v2 = 0, cov = 0;
      for (let i = 0; i < N; i++) { v1 += (L1[i] - m1) ** 2; v2 += (L2[i] - m2) ** 2; cov += (L1[i] - m1) * (L2[i] - m2); }
      v1 /= N - 1; v2 /= N - 1; cov /= N - 1;
      total += ((2 * m1 * m2 + C1) * (2 * cov + C2)) / ((m1 ** 2 + m2 ** 2 + C1) * (v1 + v2 + C2));
      count++;
    }
  }
  return count ? +(total / count).toFixed(4) : 1;
}

/** Heatmap RGBA : rouge proportionnel à l'écart, fond transparent si identique. */
export function heatmap(ref, render, zone = null) {
  const w = Math.min(ref.width, render.width), h = Math.min(ref.height, render.height);
  const x0 = zone ? Math.floor(zone.x) : 0, y0 = zone ? Math.floor(zone.y) : 0;
  const zw = zone ? Math.min(w - x0, Math.ceil(zone.width)) : w;
  const zh = zone ? Math.min(h - y0, Math.ceil(zone.height)) : h;
  const out = new Uint8ClampedArray(zw * zh * 4);
  for (let y = 0; y < zh; y++) for (let x = 0; x < zw; x++) {
    const i = ((y0 + y) * w + (x0 + x)) * 4, o = (y * zw + x) * 4;
    const d = Math.max(Math.abs(ref.data[i] - render.data[i]), Math.abs(ref.data[i + 1] - render.data[i + 1]), Math.abs(ref.data[i + 2] - render.data[i + 2]));
    out[o] = 255; out[o + 1] = Math.max(0, 255 - d * 4); out[o + 2] = 0; out[o + 3] = d > 8 ? 255 : 40;
  }
  return { width: zw, height: zh, data: out };
}

/**
 * Comparaison complète : P0 (structure), puis zones, puis global.
 * `zones` : [{id, x, y, width, height, critical?:bool}].
 * `thresholds` : {pixelTolerance, zoneFailDeltaE, zoneFailDiffPct, ssimWarn} — obligatoires,
 * jamais supposés : absence = verdict 'unrated'.
 */
export function compareBuffers(ref, render, { zones = [], thresholds = null } = {}) {
  const p0 = checkDimensions(ref, render);
  const sized = p0.length === 0;
  const zoneResults = sized ? zones.map(z => {
    const stats = zoneStats(ref, render, z, { pixelTolerance: thresholds?.pixelTolerance ?? 8 });
    let verdict = 'unrated';
    if (thresholds && stats.valid) {
      const fail = stats.meanDeltaE > thresholds.zoneFailDeltaE || stats.pixelDiffPct > thresholds.zoneFailDiffPct;
      verdict = fail ? 'fail' : 'pass';
    }
    return { ...stats, critical: z.critical === true, verdict };
  }) : [];
  const global = sized ? {
    ...zoneStats(ref, render, { id: 'GLOBAL', x: 0, y: 0, width: ref.width, height: ref.height }, { pixelTolerance: thresholds?.pixelTolerance ?? 8 }),
    ssim: ssim(ref, render)
  } : null;
  const criticalFailures = zoneResults.filter(z => z.critical && z.verdict === 'fail').map(z => z.zone);
  return {
    version: 'VFE-FIDELITY-1',
    thresholds: thresholds || null,
    p0,
    zones: zoneResults,
    global,
    verdict: p0.length ? 'fail-p0'
      : !thresholds ? 'unrated'
      : criticalFailures.length ? 'fail-critical-zone'
      : zoneResults.some(z => z.verdict === 'fail') ? 'fail-zone'
      : thresholds.ssimWarn != null && global?.ssim < thresholds.ssimWarn ? 'warn-texture'
      : 'pass',
    criticalFailures,
    note: 'Un verdict global pass n\'efface jamais un échec de zone critique.'
  };
}
