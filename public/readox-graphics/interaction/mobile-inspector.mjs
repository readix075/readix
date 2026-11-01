/** BG-L9 (cahier BG-COMP-1.0 §9.2, disposition chapitre 21) — Inspecteur mobile
 * à six catégories.
 *
 * Comportement contractuel :
 * - Le bouton inférieur « Plus » ouvre la grille compacte des SIX catégories
 *   (Propriétés, Style, Cadre, Effets, Typographie, Outils contextuels) + une
 *   tuile « Outils » (chemin complémentaire vers la feuille C3 existante :
 *   enregistrer, exporter, zoom… — aucune fonctionnalité retirée).
 * - Toucher une catégorie REMPLACE la grille par le panneau spécialisé ;
 *   en-tête fixe avec flèche de retour « ‹ Plus › Catégorie » et fermeture × ;
 *   défilement vertical interne indépendant du canvas ; jamais six panneaux
 *   simultanément ; sélection et modifications conservées au retour.
 * - Safe areas (env(safe-area-inset-bottom)), cibles tactiles ≥ 44 px,
 *   champs en font-size ≥ 16 px (pas de zoom forcé du clavier virtuel).
 *
 * Circuit canonique UNIQUE : chaque contrôle passe par
 * host().snapshot() → mutation de l'objet de scène → host().render() —
 * le même chemin que le panneau P4 desktop (aucun moteur parallèle, aucune
 * seconde source de vérité). Les commandes existantes (grouper, dissocier,
 * dupliquer, supprimer, calques, undo/redo) sont déléguées aux boutons
 * d'origine de l'éditeur (click()), jamais réimplémentées.
 *
 * Enregistrement : ce module est chargé en <script type="module"> APRÈS le
 * contrôleur C3 dans le document ; les modules étant différés, ce listener de
 * capture est enregistré AVANT celui de C3 (enregistré au DOMContentLoaded) —
 * l'interception de « Plus » est donc déterministe, et hors mobile tout est
 * inerte (zéro impact desktop).
 */
import { normalizeCrop } from './transform-geometry.mjs';

(() => {
  'use strict';
  if (window.ReadoxFlyerMobileL9) return;

  const mobile = () => matchMedia('(max-width:820px)').matches;
  const host = () => window.__readoxP3Host || window.__readoxFlyerP3Host;
  const $doc = (sel) => document.querySelector(sel);
  const currentItem = () => {
    const h = host(); const id = h?.getSelected();
    return id ? h.getItems().find(v => v.id === id) : null;
  };
  const isText = it => ['text', 'textbox', 'richText', 'textOnPath'].includes(it?.type);

  /** Mutation canonique (identique au panneau P4) + propagation groupe. */
  function edit(fn) {
    const h = host(); const it = currentItem();
    if (!h || !it) return;
    h.snapshot();
    fn(it);
    if (it.type === 'group' && window.ReadoxP4Groups?.syncGroupBaselines) window.ReadoxP4Groups.syncGroupBaselines();
    h.render();
    syncPanel();
  }

  /** Clic délégué sur un bouton existant de l'éditeur (commande d'origine). */
  function delegate(id) {
    const el = document.getElementById(id);
    if (el && !el.disabled) { el.click(); setTimeout(syncPanel, 80); }
  }

  // ─── Zoom mobile : le document entier reste atteignable (D30) ───────────
  // Le socle applique un scale CSS fixe (0,65 sous 800 px) calibré pour les
  // modèles historiques 510 px. Un document 1199 px y mesure 778 px : dans un
  // viewport de 390 px, le centrage flex de .scrollcanvas rend alors le tiers
  // GAUCHE de la page physiquement inaccessible au défilement (T6). On règle
  // le zoom CANONIQUE de l'éditeur (boutons −/＋ existants, délégation pure)
  // pour que la page tienne dans la largeur utile — aucun moteur parallèle.
  let zoomRepere = '';
  function ajusterZoomMobile() {
    if (!mobile()) return;
    const g = window.ReadoxDocumentGeometry;
    const scc = $doc('.scrollcanvas');
    const page = document.getElementById('page');
    const moins = document.getElementById('zoomOut'), plus = document.getElementById('zoomIn');
    if (!g || !scc || !page || !moins || !plus) return;
    const repere = `${scc.clientWidth}x${g.width}`;
    if (repere === zoomRepere) return; // viewport et document inchangés : respecte un zoom manuel
    const utile = scc.clientWidth - 24;
    let garde = 24;
    while (page.getBoundingClientRect().width > utile && garde-- > 0) {
      const avant = page.getBoundingClientRect().width;
      moins.click();
      if (page.getBoundingClientRect().width === avant) break; // borne basse atteinte
    }
    while (page.getBoundingClientRect().width < utile * 0.82 && garde-- > 0) {
      const avant = page.getBoundingClientRect().width;
      plus.click();
      const apres = page.getBoundingClientRect().width;
      if (apres > utile) { moins.click(); break; } // ne jamais re-déborder
      if (apres === avant) break; // borne haute atteinte
    }
    zoomRepere = repere;
  }
  let zoomMinuteur = null;
  const planifierZoomMobile = () => { clearTimeout(zoomMinuteur); zoomMinuteur = setTimeout(ajusterZoomMobile, 250); };
  window.addEventListener('resize', planifierZoomMobile);
  const zoomObservateur = new MutationObserver(planifierZoomMobile);
  const initZoomMobile = () => {
    const page = document.getElementById('page');
    if (!page) return;
    zoomObservateur.observe(page, { childList: true });
    planifierZoomMobile();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initZoomMobile);
  else initZoomMobile();

  // ─── Feuille : structure ──────────────────────────────────────────────────

  let backdrop, sheet, headBack, headTitle, body;
  let view = 'grid'; // 'grid' | category key
  const CATEGORIES = [
    ['props', 'Propriétés', '⌖', 'Position, taille, rotation, opacité'],
    ['style', 'Style', '◐', 'Fond, dégradé, rayon'],
    ['frame', 'Cadre', '▣', 'Masque et recadrage'],
    ['effects', 'Effets', '✦', 'Ombre portée'],
    ['typo', 'Typographie', 'Ｔ', 'Texte, police, graisse, crénage'],
    ['tools', 'Outils contextuels', '⧉', 'Grouper, dissocier, calques'],
  ];
  const LABELS = Object.fromEntries(CATEGORIES.map(([k, l]) => [k, l]));

  function build() {
    if (document.getElementById('rxl9-sheet')) return;

    const st = document.createElement('style');
    st.id = 'rxl9-style';
    st.textContent = `
@media(max-width:820px){
 /* D34 : les règles P3 (z-index 59000) et l'overlay de sélection (60000)
    recouvrent l'écran entier — la feuille doit passer au-dessus, sinon son
    bord gauche est masqué par la règle verticale. Les poignées de l'objet
    sélectionné restent visibles : elles sont spatialement AU-DESSUS de la
    feuille (P4-HANDLES), jamais sous elle. */
 #rxl9-sheet{position:fixed;inset:auto 0 0;max-height:min(74dvh,680px);display:flex;flex-direction:column;
   background:#0e2038;color:#e8f1ff;z-index:60002;box-shadow:0 -12px 45px #010813cc;border-radius:20px 20px 0 0;
   padding:0 16px calc(16px + env(safe-area-inset-bottom));box-sizing:border-box;touch-action:pan-y}
 #rxl9-sheet[hidden],#rxl9-backdrop[hidden]{display:none!important}
 #rxl9-backdrop{position:fixed;inset:0;background:#010813a6;z-index:60001}
 #rxl9-sheet .rxl9-head{display:flex;align-items:center;gap:10px;padding:14px 0 10px;flex:none;
   border-bottom:1px solid #1f4a75;font-size:17px;font-weight:700}
 #rxl9-sheet .rxl9-head .rxl9-title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 #rxl9-sheet .rxl9-head button{flex:none;width:44px;min-height:44px;font-size:20px;border-radius:12px;
   background:#0d2a47;color:#cfe8ff;border:1px solid #1f4a75;cursor:pointer}
 #rxl9-sheet .rxl9-body{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px 0 4px}
 #rxl9-sheet .rxl9-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
 #rxl9-sheet .rxl9-tile{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:64px;
   padding:12px;border-radius:12px;background:#0d2a47;color:#e8f1ff;border:1px solid #1f4a75;cursor:pointer;
   font:inherit;text-align:left}
 #rxl9-sheet .rxl9-tile .rxl9-symbol{font-size:20px;color:#6fb1ff}
 #rxl9-sheet .rxl9-tile .rxl9-sub{font-size:11px;color:#8fb0d4}
 #rxl9-sheet .rxl9-row{display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap}
 #rxl9-sheet .rxl9-row label{flex:1;font-size:13px;color:#9fb8d0}
 #rxl9-sheet input[type=number],#rxl9-sheet input[type=text],#rxl9-sheet textarea,#rxl9-sheet select{
   font:inherit;font-size:16px;background:#081c30;color:#fff;border:1px solid #1f4a75;border-radius:10px;
   padding:10px 12px;box-sizing:border-box;min-height:44px}
 #rxl9-sheet input[type=number]{width:96px}
 #rxl9-sheet input[type=color]{width:52px;height:44px;border:1px solid #1f4a75;border-radius:10px;background:#081c30;padding:4px}
 #rxl9-sheet input[type=range]{flex:2;min-width:120px;accent-color:#2f81f7;height:44px}
 #rxl9-sheet textarea{width:100%;resize:vertical}
 #rxl9-sheet .rxl9-btn{font:inherit;min-height:44px;padding:10px 14px;border-radius:12px;cursor:pointer;
   background:#0d2a47;color:#cfe8ff;border:1px solid #1f4a75}
 #rxl9-sheet .rxl9-btn[aria-pressed=true]{background:#2f81f7;color:#fff;border-color:#2f81f7}
 #rxl9-sheet .rxl9-btn:disabled{opacity:.45;cursor:default}
 #rxl9-sheet .rxl9-btn.rxl9-danger{color:#ff9c9c;border-color:#7a2f3a}
 #rxl9-sheet .rxl9-note{font-size:12px;color:#8fb0d4;margin:10px 0 4px}
 #rxl9-sheet .rxl9-empty{font-size:13px;color:#8fb0d4;padding:14px 4px}
 #rxl9-sheet .rxl9-stop{display:flex;align-items:center;gap:8px;margin:6px 0}
}
@media(min-width:821px){#rxl9-sheet,#rxl9-backdrop{display:none!important}}
`;
    document.head.appendChild(st);

    backdrop = document.createElement('div');
    backdrop.id = 'rxl9-backdrop'; backdrop.hidden = true;
    sheet = document.createElement('section');
    sheet.id = 'rxl9-sheet'; sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Inspecteur mobile');
    sheet.innerHTML = '<div class="rxl9-head"><button type="button" class="rxl9-back" aria-label="Retour à la grille Plus">‹</button><span class="rxl9-title">Plus</span><button type="button" class="rxl9-close" aria-label="Fermer le panneau">×</button></div><div class="rxl9-body"></div>';
    document.body.append(backdrop, sheet);
    headBack = sheet.querySelector('.rxl9-back');
    headTitle = sheet.querySelector('.rxl9-title');
    body = sheet.querySelector('.rxl9-body');

    backdrop.addEventListener('click', close);
    sheet.querySelector('.rxl9-close').addEventListener('click', close);
    headBack.addEventListener('click', showGrid);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) close(); });
    // Changement de sélection pendant que la feuille est ouverte : le canvas
    // Fabric recouvre les divs (pointer-events:none) — la sélection remonte via
    // state.choose, sans événement DOM sur .element. Surveillance légère.
    let lastSel = null;
    setInterval(() => {
      if (sheet.hidden || !mobile()) { lastSel = null; return; }
      const sel = host()?.getSelected() || null;
      if (sel !== lastSel) { lastSel = sel; if (view !== 'grid') syncPanel(); }
    }, 400);
  }

  // ─── Navigation grille ⇄ panneau ──────────────────────────────────────────

  function open() {
    if (!mobile()) return;
    build();
    showGrid();
    sheet.hidden = false; backdrop.hidden = false;
    // D32 : la feuille recouvre le bas du viewport sans créer d'espace de
    // défilement — le bas du document (CTA, pied) ne pourrait JAMAIS être
    // remonté au-dessus d'elle. Réserve temporairement cette hauteur dans le
    // flux défilant (pattern bottom-sheet). Le padding du conteneur flex est
    // ignoré par le calcul de débordement de Chromium : on étend plutôt la
    // marge basse de #page (mécanisme déjà utilisé par le zoom canonique).
    const page = document.getElementById('page');
    if (page && !sheet.dataset.rxl9PadOn) {
      sheet.dataset.rxl9PadOn = '1';
      sheet.dataset.rxl9PadVal = page.style.marginBottom || '';
      sheet.dataset.rxl9PadH = String(sheet.getBoundingClientRect().height + 30);
      const actuelle = parseFloat(page.style.marginBottom) || 0;
      page.style.marginBottom = (actuelle + parseFloat(sheet.dataset.rxl9PadH)) + 'px';
    }
    keepSelectionVisible();
  }
  function close() {
    if (sheet) sheet.hidden = true;
    if (backdrop) backdrop.hidden = true;
    const page = document.getElementById('page');
    if (page && sheet.dataset.rxl9PadOn) {
      // Ne restaure que si la marge n'a pas été recalculée entre-temps (zoom).
      const attendue = (parseFloat(sheet.dataset.rxl9PadVal) || 0) + (parseFloat(sheet.dataset.rxl9PadH) || 0);
      if (Math.abs((parseFloat(page.style.marginBottom) || 0) - attendue) < 1.5) {
        page.style.marginBottom = sheet.dataset.rxl9PadVal;
      }
      delete sheet.dataset.rxl9PadOn; delete sheet.dataset.rxl9PadVal; delete sheet.dataset.rxl9PadH;
    }
  }

  /** P4-HANDLES : l'objet sélectionné reste visible au-dessus de la feuille.
   *  Ne JAMAIS utiliser scrollIntoView ici : il ferait défiler #page elle-même
   *  (overflow:hidden reste défilable par programme), ce qui désalignerait le
   *  miroir Fabric de la géométrie du document (D27). On ne pan que le
   *  conteneur de défilement prévu à cet effet, .scrollcanvas. */
  function keepSelectionVisible() {
    const page = document.getElementById('page');
    const scc = document.querySelector('.scrollcanvas');
    if (!page || !scc) return;
    if (page.scrollTop || page.scrollLeft) { page.scrollTop = 0; page.scrollLeft = 0; }
    const id = host()?.getSelected();
    const it = id && host()?.getItems().find(i => i.id === id);
    if (!it) return;
    const pr = page.getBoundingClientRect();
    const sc = pr.width / (window.ReadoxDocumentGeometry?.width || 1199);
    const cy = pr.top + (it.y + it.h / 2) * sc;
    const haut = 76; // sous l'en-tête
    const bas = (sheet && !sheet.hidden ? sheet.getBoundingClientRect().top : innerHeight) - 16;
    if (cy > bas || cy < haut) {
      scc.scrollTop += cy - Math.max(haut + 30, (haut + bas) / 2);
    }
  }

  function showGrid() {
    view = 'grid';
    headBack.style.visibility = 'hidden';
    headTitle.textContent = 'Plus';
    body.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'rxl9-grid';
    for (const [key, label, symbol, sub] of CATEGORIES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rxl9-tile'; b.dataset.rxl9 = key;
      b.innerHTML = `<span class="rxl9-symbol">${symbol}</span><span>${label}</span><span class="rxl9-sub">${sub}</span>`;
      b.addEventListener('click', () => showPanel(key));
      grid.appendChild(b);
    }
    const outils = document.createElement('button');
    outils.type = 'button'; outils.className = 'rxl9-tile'; outils.dataset.rxl9 = 'outils';
    outils.innerHTML = '<span class="rxl9-symbol">⚙</span><span>Outils</span><span class="rxl9-sub">Enregistrer, exporter, zoom…</span>';
    outils.addEventListener('click', () => { close(); window.ReadoxFlyerMobileC3?.show('more'); });
    grid.appendChild(outils);
    body.appendChild(grid);
    const note = document.createElement('p');
    note.className = 'rxl9-note';
    note.textContent = currentItem()
      ? 'Sélection conservée : les panneaux agissent sur l’objet sélectionné.'
      : 'Sélectionnez un objet sur la page, puis ouvrez une catégorie.';
    body.appendChild(note);
  }

  function showPanel(key) {
    if (!LABELS[key]) return;
    view = key;
    headBack.style.visibility = '';
    headTitle.textContent = `‹ Plus › ${LABELS[key]}`;
    body.replaceChildren();
    BUILDERS[key](body);
    keepSelectionVisible();
  }

  function syncPanel() {
    if (sheet.hidden || view === 'grid' || !LABELS[view]) return;
    // Repeint le panneau courant (les champs se resynchronisent sur l'objet).
    const scroll = body.scrollTop;
    body.replaceChildren();
    BUILDERS[view](body);
    body.scrollTop = scroll;
  }

  // ─── Constructeurs de contrôles ───────────────────────────────────────────

  function row(parent, label, input) {
    const r = document.createElement('div');
    r.className = 'rxl9-row';
    const l = document.createElement('label'); l.textContent = label;
    r.append(l, input);
    parent.appendChild(r);
    return r;
  }
  function num(value, onchange, opts = {}) {
    const i = document.createElement('input');
    i.type = 'number'; i.inputMode = 'decimal';
    i.value = value ?? '';
    if (opts.step != null) i.step = opts.step;
    if (opts.min != null) i.min = opts.min;
    if (opts.max != null) i.max = opts.max;
    i.addEventListener('change', () => onchange(Number(i.value)));
    return i;
  }
  function color(value, onchange) {
    const i = document.createElement('input');
    i.type = 'color';
    i.value = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#000000';
    i.addEventListener('change', () => onchange(i.value));
    return i;
  }
  function emptyNote(parent, msg) {
    const p = document.createElement('p');
    p.className = 'rxl9-empty'; p.textContent = msg;
    parent.appendChild(p);
  }

  const BUILDERS = {
    // ── Propriétés : X/Y/L/H/angle/opacité ──────────────────────────────────
    props(parent) {
      const it = currentItem();
      if (!it) return emptyNote(parent, 'Sélectionnez un objet sur la page pour modifier sa position et sa taille.');
      row(parent, 'Position X', num(it.x, v => { if (Number.isFinite(v)) edit(o => { o.x = Math.round(v); }); }));
      row(parent, 'Position Y', num(it.y, v => { if (Number.isFinite(v)) edit(o => { o.y = Math.round(v); }); }));
      row(parent, 'Largeur', num(it.w, v => { if (v >= 1) edit(o => { o.w = Math.round(v); }); }, { min: 1 }));
      row(parent, 'Hauteur', num(it.h, v => { if (v >= 1) edit(o => { o.h = Math.round(v); }); }, { min: 1 }));
      row(parent, 'Angle (°)', num(Number(it.rotation) || 0, v => { if (Number.isFinite(v)) edit(o => { o.rotation = v; }); }, { step: 1 }));
      row(parent, 'Opacité (%)', num(it.opacity ?? 100, v => { if (Number.isFinite(v)) edit(o => { o.opacity = Math.max(0, Math.min(100, Math.round(v))); }); }, { min: 0, max: 100 }));
    },

    // ── Style : fond, dégradé, rayon ────────────────────────────────────────
    style(parent) {
      const it = currentItem();
      if (!it) return emptyNote(parent, 'Sélectionnez un objet pour modifier son style.');
      if (it.type === 'group') return emptyNote(parent, 'Groupe sélectionné : double-touchez un enfant sur la page pour le styliser individuellement.');
      if (it.type !== 'image') {
        row(parent, 'Couleur de fond', color(it.bg, v => edit(o => { o.bg = v; if (o.fill?.stops?.length) o.fill.stops[0].color = v; })));
      }
      // Dégradé (miroir de la section P4 desktop)
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = !!it.fill;
      chk.style.cssText = 'width:28px;height:28px;accent-color:#2f81f7';
      chk.addEventListener('change', () => edit(o => {
        if (chk.checked) o.fill = { type: 'linear', angle: 90, stops: [{ offset: 0, color: o.bg || '#0bb8ef', alpha: 1 }, { offset: 1, color: '#031326', alpha: 1 }] };
        else delete o.fill;
      }));
      row(parent, 'Dégradé', chk);
      if (it.fill) {
        const sel = document.createElement('select');
        sel.innerHTML = '<option value="linear">Linéaire</option><option value="radial">Radial</option>';
        sel.value = it.fill.type || 'linear';
        sel.addEventListener('change', () => edit(o => { if (o.fill) o.fill.type = sel.value; }));
        row(parent, 'Type de dégradé', sel);
        row(parent, 'Angle (°)', num(it.fill.angle ?? 90, v => { if (Number.isFinite(v)) edit(o => { if (o.fill) o.fill.angle = v; }); }, { step: 5 }));
        (it.fill.stops || []).forEach((s, idx) => {
          const wrap = document.createElement('div');
          wrap.className = 'rxl9-stop';
          const off = num(s.offset, v => { if (v >= 0 && v <= 1) edit(o => { if (o.fill?.stops?.[idx]) o.fill.stops[idx].offset = v; }); }, { min: 0, max: 1, step: 0.05 });
          const col = color(s.color, v => edit(o => { if (o.fill?.stops?.[idx]) o.fill.stops[idx].color = v; }));
          const del = document.createElement('button');
          del.type = 'button'; del.className = 'rxl9-btn rxl9-danger'; del.textContent = '×';
          del.addEventListener('click', () => edit(o => { if (o.fill?.stops?.length > 2) o.fill.stops.splice(idx, 1); }));
          const lab = document.createElement('label'); lab.textContent = `Stop ${idx + 1}`; lab.style.flex = '1';
          wrap.append(lab, off, col, del);
          parent.appendChild(wrap);
        });
        const add = document.createElement('button');
        add.type = 'button'; add.className = 'rxl9-btn'; add.textContent = '+ Stop';
        add.addEventListener('click', () => edit(o => { if (o.fill) o.fill.stops.push({ offset: 0.5, color: '#ffffff', alpha: 1 }); }));
        row(parent, '', add);
      }
      if (it.type === 'rect') {
        row(parent, 'Rayon des coins', num(it.radius ?? 0, v => { if (v >= 0) edit(o => { if (v > 0) o.radius = v; else delete o.radius; }); }, { min: 0 }));
      }
    },

    // ── Cadre : masque + recadrage ──────────────────────────────────────────
    frame(parent) {
      const it = currentItem();
      if (!it) return emptyNote(parent, 'Sélectionnez un objet pour modifier son cadre.');
      if (it.type === 'group') return emptyNote(parent, 'Groupe sélectionné : double-touchez un enfant (photo, forme) pour modifier son cadre.');
      const sel = document.createElement('select');
      sel.innerHTML = '<option value="">Aucun masque</option><option value="ellipse">Ellipse</option><option value="roundedRect">Rectangle arrondi</option><option value="rect">Rectangle</option>';
      sel.value = it.mask?.type || '';
      sel.addEventListener('change', () => edit(o => {
        if (!sel.value) delete o.mask;
        else o.mask = { type: sel.value, radius: o.mask?.radius ?? 12 };
      }));
      row(parent, 'Masque', sel);
      if (it.mask?.type === 'roundedRect') {
        row(parent, 'Rayon du masque', num(it.mask.radius ?? 12, v => { if (v >= 0) edit(o => { if (o.mask) o.mask.radius = v; }); }, { min: 0 }));
      }
      if (it.type === 'image') {
        const c = normalizeCrop(it.crop);
        const pct = v => Math.round(v * 1000) / 10;
        const setCrop = (key, v) => {
          if (!Number.isFinite(v) || v < 0 || v > 90) return;
          edit(o => {
            const cur = normalizeCrop(o.crop);
            cur[key] = v / 100;
            o.crop = normalizeCrop(cur);
          });
        };
        const t = document.createElement('p');
        t.className = 'rxl9-note'; t.textContent = 'Recadrage de la fenêtre visible (en % de chaque côté) :';
        parent.appendChild(t);
        row(parent, 'Gauche (%)', num(pct(c.l), v => setCrop('l', v), { min: 0, max: 90, step: 0.5 }));
        row(parent, 'Haut (%)', num(pct(c.t), v => setCrop('t', v), { min: 0, max: 90, step: 0.5 }));
        row(parent, 'Droite (%)', num(pct(c.r), v => setCrop('r', v), { min: 0, max: 90, step: 0.5 }));
        row(parent, 'Bas (%)', num(pct(c.b), v => setCrop('b', v), { min: 0, max: 90, step: 0.5 }));
        const reset = document.createElement('button');
        reset.type = 'button'; reset.className = 'rxl9-btn'; reset.textContent = 'Réinitialiser le recadrage';
        reset.addEventListener('click', () => edit(o => { delete o.crop; }));
        row(parent, '', reset);
      }
    },

    // ── Effets : ombre portée (schéma canonique {offsetX,offsetY,blur,color}) ──
    effects(parent) {
      const it = currentItem();
      if (!it) return emptyNote(parent, 'Sélectionnez un objet pour lui appliquer un effet.');
      const sh = typeof it.shadow === 'object' && it.shadow ? it.shadow : null;
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = !!it.shadow;
      chk.style.cssText = 'width:28px;height:28px;accent-color:#2f81f7';
      chk.addEventListener('change', () => edit(o => {
        if (chk.checked) o.shadow = { offsetX: 3, offsetY: 3, blur: 6, color: '#00000099' };
        else delete o.shadow;
      }));
      row(parent, 'Ombre portée', chk);
      if (it.shadow) {
        const blur = document.createElement('input');
        blur.type = 'range'; blur.min = 0; blur.max = 30; blur.value = sh?.blur ?? (Number(it.shadowBlur) || 6);
        blur.addEventListener('change', () => edit(o => {
          const cur = typeof o.shadow === 'object' && o.shadow ? o.shadow : { offsetX: 3, offsetY: 3, blur: 6, color: '#00000099' };
          o.shadow = { ...cur, blur: Number(blur.value) };
        }));
        row(parent, `Flou (${blur.value} px)`, blur);
        const off = document.createElement('input');
        off.type = 'range'; off.min = 0; off.max = 30; off.value = sh?.offsetY ?? (Number(it.shadowOffset) || 3);
        off.addEventListener('change', () => edit(o => {
          const cur = typeof o.shadow === 'object' && o.shadow ? o.shadow : { offsetX: 3, offsetY: 3, blur: 6, color: '#00000099' };
          o.shadow = { ...cur, offsetX: Number(off.value), offsetY: Number(off.value) };
        }));
        row(parent, `Décalage (${off.value} px)`, off);
        row(parent, 'Couleur de l’ombre', color(sh?.color, v => edit(o => {
          const cur = typeof o.shadow === 'object' && o.shadow ? o.shadow : { offsetX: 3, offsetY: 3, blur: 6, color: '#00000099' };
          o.shadow = { ...cur, color: v };
        })));
        const note = document.createElement('p');
        note.className = 'rxl9-note';
        note.textContent = isText(it) ? 'Ombre de texte (text-shadow).' : 'Ombre d’objet (box-shadow, export SVG et miroir inclus).';
        parent.appendChild(note);
      }
    },

    // ── Typographie : contenu, police, graisse, crénage ─────────────────────
    typo(parent) {
      const it = currentItem();
      if (!it) return emptyNote(parent, 'Sélectionnez un texte sur la page pour le modifier.');
      if (!isText(it)) return emptyNote(parent, 'L’objet sélectionné n’est pas un texte : double-touchez un texte (titre, prix, bouton…) pour l’éditer.');
      const ta = document.createElement('textarea');
      ta.rows = 2; ta.value = it.text ?? '';
      ta.addEventListener('change', () => edit(o => { o.text = ta.value; }));
      row(parent, 'Texte', ta);
      const font = document.createElement('input');
      font.type = 'text'; font.value = it.font || ''; font.placeholder = 'Inter, Great Vibes, Arial…';
      font.setAttribute('list', 'rxl9-fonts');
      const dl = document.createElement('datalist');
      dl.id = 'rxl9-fonts';
      dl.innerHTML = ['Inter', 'Great Vibes', 'Arial', 'Georgia', 'Impact', 'Verdana'].map(f => `<option value="${f}">`).join('');
      parent.appendChild(dl);
      font.addEventListener('change', () => edit(o => { if (font.value.trim()) o.font = font.value.trim(); else delete o.font; }));
      row(parent, 'Police', font);
      row(parent, 'Taille', num(it.size, v => { if (v >= 1) edit(o => { o.size = v; }); }, { min: 1 }));
      row(parent, 'Couleur du texte', color(it.color, v => edit(o => { o.color = v; })));
      const toggles = document.createElement('div');
      toggles.className = 'rxl9-row';
      [['Gras', 'bold'], ['Italique', 'italic'], ['Souligné', 'underline']].forEach(([label, key]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'rxl9-btn'; b.textContent = label;
        b.setAttribute('aria-pressed', it[key] ? 'true' : 'false');
        b.addEventListener('click', () => edit(o => { o[key] = !o[key]; }));
        toggles.appendChild(b);
      });
      parent.appendChild(toggles);
      row(parent, 'Crénage (px)', num(it.letterSpacing ?? 0, v => { if (Number.isFinite(v)) edit(o => { if (v) o.letterSpacing = v; else delete o.letterSpacing; }); }, { step: 0.5 }));
      row(parent, 'Interligne', num(it.lineHeight ?? 1.16, v => { if (v > 0) edit(o => { o.lineHeight = v; }); }, { step: 0.05, min: 0.5, max: 3 }));
    },

    // ── Outils contextuels : commandes d'origine déléguées ──────────────────
    tools(parent) {
      const it = currentItem();
      const grid = document.createElement('div');
      grid.className = 'rxl9-grid';
      const cmds = [
        ['Grouper', 'p4-group', '⧉'],
        ['Dissocier', 'p4-ungroup', '⊟'],
        ['Dupliquer', 'duplicate', '⧉'],
        ['Premier plan', 'front', '↑'],
        ['Reculer d’un calque', 'back', '↓'],
        ['Supprimer', 'delete', '✕'],
        ['Annuler', 'undo', '↶'],
        ['Rétablir', 'redo', '↷'],
      ];
      for (const [label, id, symbol] of cmds) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'rxl9-tile'; b.dataset.rxl9Command = id;
        const target = document.getElementById(id);
        b.disabled = !target || target.disabled;
        b.innerHTML = `<span class="rxl9-symbol">${symbol}</span><span>${label}</span>`;
        b.addEventListener('click', () => delegate(id));
        grid.appendChild(b);
      }
      parent.appendChild(grid);
      const note = document.createElement('p');
      note.className = 'rxl9-note';
      note.textContent = it
        ? `Sélection : ${it.name || it.id}${it.type === 'group' ? ` (groupe de ${it.children?.length || 0})` : ''} — double-toucher un enfant sur la page le sous-sélectionne.`
        : 'Sélectionnez un objet sur la page pour activer les commandes.';
      parent.appendChild(note);
    },
  };

  // ─── Interception du bouton « Plus » (mobile uniquement) ──────────────────
  // Enregistré à l'évaluation du module (différée, avant DOMContentLoaded) :
  // prioritaire sur le listener C3 (enregistré au DOMContentLoaded).
  document.addEventListener('click', e => {
    if (!mobile()) return;
    const btn = e.target.closest('#rxv4-bottom [data-rxv4="more"]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open();
  }, true);

  window.ReadoxFlyerMobileL9 = {
    open, close, showPanel, showGrid,
    view: () => view,
    audit: () => ({
      mobile: mobile(),
      sheet: !!document.getElementById('rxl9-sheet'),
      categories: CATEGORIES.map(([k]) => k),
      outilsVersC3: !!window.ReadoxFlyerMobileC3,
      selection: host()?.getSelected() || null,
    }),
  };
})();
