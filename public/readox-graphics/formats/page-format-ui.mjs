/** Readox — Sélecteur de format de page (cahier v5.2 §5.1, §5.3, §6.1, Phase 2).
 * Barre supérieure : choix du format AVANT et APRÈS ouverture d'un modèle,
 * orientation, dimensions personnalisées ; conversion via trois stratégies
 * explicites (adapter sans déformer / recadrer avec confirmation / recomposer
 * avec contraintes — désactivée honnêtement sans contraintes de scène).
 * Le sélecteur lit le registre formats-registry.mjs ; aucune constante de
 * format n'est dupliquée ici. Intégration additive : capture → transformation
 * pure → restore (l'undo/redo historique couvre la dimension de page depuis
 * la Phase 2 ; voir snapshot()/capture() de flyer-maker.html).
 */
import { FORMATS, getFormat, customFormat, formatDimsPx, detectFormat } from './formats-registry.mjs';
import { applyFormatToDoc, STRATEGIES } from './apply-format.mjs';
import { dimsFromPx } from './units.mjs';

const STYLE = `
#p2-format-wrap{display:flex;align-items:center;gap:6px}
#p2-format-wrap select{max-width:170px;background:#07203a;color:#eaf4ff;border:1px solid #1d4568;border-radius:9px;padding:9px 8px;font-size:13px}
#p2-format-orient{background:#07203a;color:#eaf4ff;border:1px solid #1d4568;border-radius:9px;padding:9px 10px;font-size:13px;cursor:pointer}
#p2-format-modal{position:fixed;inset:0;background:#020914d9;z-index:320000;display:flex;align-items:center;justify-content:center;padding:14px}
#p2-format-modal[hidden]{display:none}
#p2-format-modal section{background:#062036;color:#eaf4ff;border:1px solid #1d4568;border-radius:14px;padding:20px;max-width:460px;width:100%}
#p2-format-modal h2{margin:0 0 8px;font-size:18px}
#p2-format-modal p{color:#a9c3de;font-size:13px;margin:4px 0 14px}
#p2-format-modal .p2-strat{display:block;width:100%;text-align:left;margin:6px 0;padding:12px;border:1px solid #1d4568;border-radius:10px;background:#0a2a4a;color:#eaf4ff;cursor:pointer}
#p2-format-modal .p2-strat small{display:block;color:#9db8d4;margin-top:3px}
#p2-format-modal .p2-strat:disabled{opacity:.45;cursor:not-allowed}
#p2-format-modal .p2-row{display:flex;gap:8px;margin:8px 0}
#p2-format-modal input{width:100%;background:#041627;color:#eaf4ff;border:1px solid #1d4568;border-radius:8px;padding:9px}
#p2-format-modal .p2-cancel{margin-top:10px;background:transparent;border:1px solid #1d4568;border-radius:9px;color:#9db8d4;padding:9px 14px;cursor:pointer}
`;

function currentPagePx() {
  const g = window.ReadoxDocumentGeometry;
  return { width: g?.width || 510, height: g?.height || 660 };
}

export function installFormatSelector() {
  if (document.getElementById('p2-format-wrap')) return false;
  const actions = document.querySelector('header .actions');
  const api = () => window.__readoxFlyerPhase8;
  if (!actions || !api()) return false;

  const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);

  const wrap = document.createElement('div'); wrap.id = 'p2-format-wrap';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Format de page');
  const byFamily = new Map();
  for (const f of FORMATS) { if (!byFamily.has(f.family)) byFamily.set(f.family, []); byFamily.get(f.family).push(f); }
  const current = document.createElement('option'); current.value = ''; current.textContent = 'Format…'; select.appendChild(current);
  for (const [family, list] of byFamily) {
    const og = document.createElement('optgroup'); og.label = family;
    for (const f of list) { const o = document.createElement('option'); o.value = f.id; o.textContent = f.name.fr; og.appendChild(o); }
    select.appendChild(og);
  }
  const custom = document.createElement('option'); custom.value = '__custom'; custom.textContent = 'Personnalisé…'; select.appendChild(custom);

  const orient = document.createElement('button'); orient.id = 'p2-format-orient'; orient.type = 'button';
  orient.title = 'Permuter portrait / paysage'; orient.textContent = '⤺ Orientation';

  wrap.append(select, orient);
  actions.insertBefore(wrap, actions.firstChild);

  // — Modale unique (stratégie + dimensions personnalisées) —
  const modal = document.createElement('div'); modal.id = 'p2-format-modal'; modal.hidden = true; document.body.appendChild(modal);

  function syncOrientationLabel() {
    const { width, height } = currentPagePx();
    orient.textContent = width > height ? '⤺ Paysage' : '⤺ Portrait';
  }
  function syncSelection() {
    const { width, height } = currentPagePx();
    const hit = detectFormat(width, height);
    select.value = hit ? hit.format.id : '';
    syncOrientationLabel();
  }

  function openStrategyModal(target, orientation) {
    const dims = formatDimsPx(target, orientation);
    modal.replaceChildren();
    const box = document.createElement('section'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const title = document.createElement('h2'); title.textContent = `Format : ${target.name.fr} (${dims.width}×${dims.height} px)`;
    const hint = document.createElement('p'); hint.textContent = 'Choisissez la stratégie de conversion. Aucune déformation automatique n\'est appliquée.';
    box.append(title, hint);
    const legacyHasConstraints = false; // la scène historique ne porte pas de contraintes (§5.1)
    for (const s of STRATEGIES) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'p2-strat';
      b.innerHTML = `${s.label}<small>${s.description}</small>`;
      if (s.id === 'recomposer' && !legacyHasConstraints) { b.disabled = true; b.title = 'Indisponible : cette scène ne définit pas de contraintes'; }
      b.onclick = () => { modal.hidden = true; apply(target, dims, s.id); };
      box.appendChild(b);
    }
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'p2-cancel'; cancel.textContent = 'Annuler';
    cancel.onclick = () => { modal.hidden = true; syncSelection(); };
    box.appendChild(cancel); modal.appendChild(box); modal.hidden = false;
  }

  function openCustomModal() {
    modal.replaceChildren();
    const box = document.createElement('section'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.innerHTML = `<h2>Format personnalisé</h2><p>Dimensions en pixels de la page (unités mm/cm/in/pt disponibles via l'API du registre).</p>
      <div class="p2-row"><input id="p2-cw" type="number" min="1" placeholder="Largeur px" value="800"><input id="p2-ch" type="number" min="1" placeholder="Hauteur px" value="600"></div>`;
    const go = document.createElement('button'); go.type = 'button'; go.className = 'p2-strat'; go.textContent = 'Choisir la stratégie…';
    go.onclick = () => {
      const w = Number(box.querySelector('#p2-cw').value), h = Number(box.querySelector('#p2-ch').value);
      try { openStrategyModal(customFormat({ width: w, height: h, unit: 'px' }), w >= h ? 'paysage' : 'portrait'); }
      catch (e) { alert('Dimensions invalides : ' + e.message); }
    };
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'p2-cancel'; cancel.textContent = 'Annuler';
    cancel.onclick = () => { modal.hidden = true; syncSelection(); };
    box.append(go, cancel); modal.appendChild(box); modal.hidden = false;
  }

  function apply(target, dims, strategy) {
    const bridge = api(); if (!bridge) return;
    const doc = bridge.capture();
    let out;
    try { out = applyFormatToDoc(doc, dims, strategy); }
    catch (e) { alert('Changement de format impossible : ' + e.message); return; }
    if (strategy === 'recadrer' && out.report.overflow.length) {
      const n = out.report.overflow.length;
      if (!confirm(`${n} objet(s) déborderont de la page (${out.report.overflow.map(o => o.id).slice(0, 5).join(', ')}…). Confirmer le recadrage ?`)) { syncSelection(); return; }
    }
    bridge.restore(out.doc);
    const status = document.getElementById('status');
    const human = dimsFromPx(dims.width, dims.height, 'mm');
    if (status) status.textContent = `Format ${target.name.fr} appliqué (${dims.width}×${dims.height} px ≈ ${human.width}×${human.height} mm) — stratégie « ${strategy} », sans déformation.`;
    document.dispatchEvent(new CustomEvent('readox:flyer:format-changed', { detail: { formatId: target.id, ...dims, strategy, report: out.report } }));
    syncSelection();
  }

  select.addEventListener('change', () => {
    if (select.value === '__custom') { openCustomModal(); return; }
    const f = getFormat(select.value);
    if (!f) return;
    openStrategyModal(f, f.orientation);
  });
  orient.addEventListener('click', () => {
    const { width, height } = currentPagePx();
    openStrategyModal(customFormat({ width: height, height: width, unit: 'px' }), width > height ? 'portrait' : 'paysage');
  });

  document.addEventListener('readox:flyer:model-opened', () => setTimeout(syncSelection, 50));
  syncSelection();

  window.ReadoxFormats = {
    list: () => FORMATS.map(f => f.id),
    detect: () => detectFormat(...Object.values(currentPagePx())),
    apply: (id, strategy = 'adapter', orientation = null) => {
      const f = getFormat(id); if (!f) throw Error('FORMAT_UNKNOWN:' + id);
      // Voie programmatique (tests, DSL) : application directe, sans modale.
      const dims = formatDimsPx(f, orientation || f.orientation);
      const bridge = api(); const out = applyFormatToDoc(bridge.capture(), dims, strategy);
      bridge.restore(out.doc);
      document.dispatchEvent(new CustomEvent('readox:flyer:format-changed', { detail: { formatId: f.id, ...dims, strategy, report: out.report } }));
      return out.report;
    },
    currentPagePx
  };
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => installFormatSelector(), { once: true });
  else installFormatSelector();
}
