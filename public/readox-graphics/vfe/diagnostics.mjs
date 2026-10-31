/** VFE — Diagnostics et préflight (cahier des charges §6.9, §7, T07/T08/T15/T25/T31).
 * Agrège les contrôles avant rendu/export : assets, polices, géométrie,
 * collisions, types non pris en charge, contraste texte/fond. Tout est
 * injectable pour rester testable sous Node ; le navigateur fournit
 * document.fonts et le collecteur console.
 */
import { validateDocument } from '../gf05a/document-validator.mjs';
import { inspectLayout } from '../gf05d1/smart-layout.mjs';
import { capability } from '../gf05d/capabilities.mjs';
import { AssetManager } from './asset-manager.mjs';

function relLuminance(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const c = i => { const v = ((n >> i) & 255) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(16) + 0.7152 * c(8) + 0.0722 * c(0);
}

export function contrastRatio(fg, bg) {
  const L1 = relLuminance(fg), L2 = relLuminance(bg);
  if (L1 == null || L2 == null) return null;
  const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
  return +((a + 0.05) / (b + 0.05)).toFixed(2);
}

export function preflight(doc, {
  assetManager = null,
  fontChecker = null,       // (family) => boolean | Promise<boolean>
  minContrast = 3,
  requireAssets = true
} = {}) {
  const blocking = [], warnings = [];

  // 1. Validité structurelle du document canonique.
  const structural = validateDocument(doc);
  if (!structural.ok) {
    for (const e of structural.errors) blocking.push({ code: 'STRUCT_' + e.code, path: e.path, message: e.message });
  }

  // 2. Assets référencés (T08, T33).
  if (assetManager && requireAssets) {
    for (const issue of assetManager.checkDocument(doc)) {
      (issue.blocking ? blocking : warnings).push({ code: issue.code, assetRef: issue.assetRef, status: issue.status });
    }
  } else {
    for (const ref of AssetManager.referencedAssets(doc)) {
      if (!doc.assets?.[ref]) blocking.push({ code: 'ASSET_REF_UNKNOWN', assetRef: ref });
    }
  }

  // 3. Polices (T07 : alerte explicite, jamais de substitution muette).
  const families = new Set();
  for (const n of Object.values(doc.nodes || {})) {
    const f = n.typography?.fontFamily;
    if (f) families.add(f);
  }
  const fontResults = [];
  if (fontChecker) {
    for (const family of families) {
      const ok = fontChecker(family);
      fontResults.push({ family, available: ok });
      if (!ok) warnings.push({ code: 'FONT_MISSING', family, policy: 'no-silent-substitution' });
    }
  } else for (const family of families) fontResults.push({ family, available: null, note: 'no-checker' });

  // 4. Géométrie : débordements et collisions (T11, T15 ; exemptions par relations).
  for (const issue of inspectLayout(doc)) {
    if (issue.code === 'PAGE_OVERFLOW') blocking.push(issue);
    else if (issue.code === 'POTENTIAL_OVERLAP') warnings.push(issue);
    else warnings.push(issue);
  }

  // 5. Types sans rendu fidèle.
  for (const n of Object.values(doc.nodes || {})) {
    const cap = capability(n.type);
    if (cap.status === 'unsupported') warnings.push({ code: 'TYPE_UNSUPPORTED', id: n.id, type: n.type, reason: cap.reason });
  }

  // 6. Contraste texte sur fond de page (heuristique simple, signalée).
  const pageBg = doc.pages?.[0]?.background || '#ffffff';
  for (const n of Object.values(doc.nodes || {})) {
    if (!['text', 'textbox'].includes(n.type)) continue;
    const ratio = contrastRatio(n.appearance?.fill || n.color, pageBg);
    if (ratio != null && ratio < minContrast) {
      warnings.push({ code: 'LOW_CONTRAST', id: n.id, ratio, min: minContrast, note: 'fond de page uniquement ; images de fond non évaluées' });
    }
  }

  return {
    version: 'VFE-PREFLIGHT-1',
    ok: blocking.length === 0,
    blocking, warnings,
    fonts: fontResults,
    stats: structural.stats || null
  };
}

/** Collecteur d'erreurs console navigateur, désactivable (§11 instrumentation). */
export function createConsoleCollector({ limit = 100 } = {}) {
  const events = [];
  let installed = false, origError = null, origWarn = null, onRej = null, onErr = null;
  return {
    events,
    install() {
      if (installed || typeof window === 'undefined') return false;
      installed = true;
      origError = console.error; origWarn = console.warn;
      console.error = (...a) => { events.push({ level: 'error', text: a.map(String).join(' ').slice(0, 500) }); origError.apply(console, a); };
      console.warn = (...a) => { events.push({ level: 'warn', text: a.map(String).join(' ').slice(0, 500) }); origWarn.apply(console, a); };
      onRej = e => events.push({ level: 'error', text: 'unhandledrejection: ' + (e.reason?.message || e.reason) });
      onErr = e => events.push({ level: 'error', text: 'window.onerror: ' + e.message });
      window.addEventListener('unhandledrejection', onRej);
      window.addEventListener('error', onErr);
      return true;
    },
    uninstall() {
      if (!installed) return;
      console.error = origError; console.warn = origWarn;
      window.removeEventListener('unhandledrejection', onRej);
      window.removeEventListener('error', onErr);
      installed = false;
    },
    report() { return { count: events.length, errors: events.filter(e => e.level === 'error').length, events: events.slice(-limit) }; }
  };
}
