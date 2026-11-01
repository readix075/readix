/** Phase 3 (cahier v5.2 §6.2) — Poignées, rotation, recadrage, métriques temps réel,
 * règles et snap. S'installe sur l'éditeur historique sans reconstruire les closures :
 * l'hôte expose un pont (__readoxFlyerP3Host) ; l'overlay vit hors de #page pour ne
 * jamais être rogné par overflow:hidden. Une transaction d'historique par geste. */
import {
  HANDLES, MIN_SIZE, toLocalDelta, applyHandleDrag, rotationFromPointer,
  snapTargetsFor, snapResize, snapResizeRotated, snapDelta, normalizeCrop, applyCropDrag, cropImgStyle,
  metricsFor, ratioLabel,
} from './transform-geometry.mjs';
import { fromPx, toPx, UNITS } from '../formats/units.mjs';

const STYLE = `
#p3-overlay{position:absolute;pointer-events:none;z-index:60000;box-sizing:border-box}
#p3-overlay .p3-box{position:absolute;border:1.5px solid #22c1ff;box-sizing:border-box;pointer-events:none}
#p3-overlay .p3-h{position:absolute;width:12px;height:12px;background:#fff;border:2px solid #008cff;border-radius:3px;box-shadow:0 1px 6px #0009;pointer-events:auto;touch-action:none;box-sizing:border-box;transform:translate(-50%,-50%)}
#p3-overlay .p3-h:focus-visible{outline:2px solid #fff;outline-offset:1px}
#p3-overlay .p3-h[data-h="nw"],#p3-overlay .p3-h[data-h="se"]{cursor:nwse-resize}
#p3-overlay .p3-h[data-h="ne"],#p3-overlay .p3-h[data-h="sw"]{cursor:nesw-resize}
#p3-overlay .p3-h[data-h="n"],#p3-overlay .p3-h[data-h="s"]{cursor:ns-resize}
#p3-overlay .p3-h[data-h="e"],#p3-overlay .p3-h[data-h="w"]{cursor:ew-resize}
#p3-overlay .p3-h.p3-crop{background:#ffd166;border-color:#b87900;border-radius:0}
#p3-overlay .p3-rot{position:absolute;left:50%;top:-30px;width:16px;height:16px;margin-left:-8px;background:#087cf8;border:2px solid #fff;border-radius:50%;cursor:grab;pointer-events:auto;touch-action:none}
#p3-overlay .p3-rot:after{content:'';position:absolute;left:6px;top:14px;height:12px;border-left:1px solid #17bfff}
#p3-overlay .p3-tools{position:absolute;left:0;top:-34px;display:flex;gap:4px;pointer-events:auto}
#p3-overlay .p3-tools button{background:#0a2a4a;color:#eaf4ff;border:1px solid #1d5a8a;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;white-space:nowrap}
#p3-overlay.p3-pagemode .p3-box{border-color:#ff9f43;border-style:dashed}
#p3-overlay.p3-pagemode .p3-h{border-color:#ff9f43}
#p3-metrics{background:#0a2038;border:1px solid #1d4568;border-radius:10px;padding:12px;margin-bottom:16px;color:#eaf4ff;font-size:12px}
#p3-metrics h2{margin:0 0 8px;font-size:14px;display:flex;justify-content:space-between;align-items:center}
#p3-metrics select{width:auto;background:#142b45;color:#fff;border:1px solid #34516e;padding:4px;border-radius:6px;font-size:12px}
#p3-metrics .p3-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#p3-metrics label{color:#a9c3e3;font-size:11px;margin:0}
#p3-metrics input{width:100%;box-sizing:border-box;background:#041627;color:#eaf4ff;border:1px solid #1d4568;border-radius:6px;padding:5px;font-size:12px}
#p3-metrics .p3-ro{color:#9fc4e8;padding:2px 0}
#p3-metrics .p3-ro b{color:#eaf4ff;font-weight:600}
#p3-metrics .p3-lock{margin-top:6px;display:flex;gap:6px;align-items:center;color:#a9c3e3}
#p3-metrics input[type=checkbox]{width:auto!important;padding:0!important;margin:0}
#p3-metrics .p3-lock label{color:#a9c3e3;margin:0}
.p3-ruler{position:absolute;background:#0a1a2ee6;z-index:59000;pointer-events:none}
#p3-ruler-h{top:0;left:24px;right:0;height:24px}
#p3-ruler-v{top:24px;left:0;bottom:0;width:24px}
#p3-ruler-corner{top:0;left:0;width:24px;height:24px;z-index:59001}
#p3-page-toggle[aria-pressed="true"]{background:#ff9f43!important;color:#1a1005!important;border-color:#ff9f43!important}
`;

const SNAP_TOLERANCE_SCREEN = 6; // px écran, convertis en unités page à chaque geste

export function installP3Interactions() {
  const host = window.__readoxFlyerP3Host;
  const page = document.getElementById('page');
  const area = document.querySelector('.canvasarea');
  const scroll = document.querySelector('.scrollcanvas');
  const props = document.querySelector('.props');
  if (!host || !page || !area || !scroll || !props) return false;
  if (document.getElementById('p3-overlay')) return false;

  const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);
  if (getComputedStyle(area).position === 'static') area.style.position = 'relative';

  // — État du module —
  // P3-L2 : l'unité d'affichage est un réglage persistant (affichage seul — le
  // canonique reste en px) et notifié (champs historiques, métriques, règles sync).
  let unit = (() => { try { const u = localStorage.getItem('readox.p3.unit'); return UNITS.includes(u) ? u : 'px'; } catch { return 'px'; } })();
  const persistUnit = () => { try { localStorage.setItem('readox.p3.unit', unit); } catch { /* stockage indisponible */ } };
  const announceUnit = () => document.dispatchEvent(new CustomEvent('readox:flyer:unit-changed', { detail: { unit } }));
  // P3-L3 : origine documentaire des règles (unités page), persistante.
  let rulerOrigin = (() => { try { const o = JSON.parse(localStorage.getItem('readox.p3.rulerOrigin')); return o && Number.isFinite(o.x) && Number.isFinite(o.y) ? { x: o.x, y: o.y } : { x: 0, y: 0 }; } catch { return { x: 0, y: 0 }; } })();
  const persistOrigin = () => { try { localStorage.setItem('readox.p3.rulerOrigin', JSON.stringify(rulerOrigin)); } catch { /* stockage indisponible */ } };
  let ratioLock = false;
  let pageMode = false;
  let cropMode = false;
  let gesture = null; // {kind, handle, initial, snapshotDone, pointerId, startScreen, centerScreen}
  let liveBox = null; // boîte écran de l'objet au début du geste

  const geom = () => window.ReadoxDocumentGeometry || { width: 510, height: 660 };
  const scale = () => { const r = page.getBoundingClientRect(); return r.width / geom().width; };
  const sel = () => host.getItems().find(i => i.id === host.getSelected());

  // — Overlay (hors #page : jamais rogné, taille écran constante) —
  const overlay = document.createElement('div'); overlay.id = 'p3-overlay'; overlay.hidden = true;
  const box = document.createElement('div'); box.className = 'p3-box'; overlay.appendChild(box);
  area.appendChild(overlay);

  const tools = document.createElement('div'); tools.className = 'p3-tools';
  const lockBtn = document.createElement('button'); lockBtn.type = 'button';
  lockBtn.title = 'Verrouiller le ratio (Maj inverse temporairement)';
  const syncLock = () => { lockBtn.textContent = ratioLock ? '🔒 Ratio' : '🔓 Ratio'; lockBtn.setAttribute('aria-pressed', String(ratioLock)); };
  lockBtn.onclick = () => { ratioLock = !ratioLock; syncLock(); };
  syncLock();
  const cropBtn = document.createElement('button'); cropBtn.type = 'button'; cropBtn.textContent = '⧉ Recadrer';
  cropBtn.title = 'Recadrer la fenêtre visible de l’image';
  cropBtn.onclick = () => { const it = sel(); if (it?.type === 'image') setCropMode(!cropMode); };
  tools.append(lockBtn, cropBtn); overlay.appendChild(tools);

  const handleEls = new Map();
  for (const h of HANDLES) {
    const el = document.createElement('span'); el.className = 'p3-h'; el.dataset.h = h;
    el.tabIndex = 0; el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Poignée ' + h);
    el.title = 'Redimensionner (' + h + ')';
    overlay.appendChild(el); handleEls.set(h, el);
    el.addEventListener('pointerdown', e => startGesture(e, h));
    el.addEventListener('keydown', e => handleKeyResize(e, h));
  }
  const rotEl = document.createElement('span'); rotEl.className = 'p3-rot'; rotEl.title = 'Pivoter (Maj = pas de 15°)';
  rotEl.tabIndex = 0; rotEl.setAttribute('role', 'button'); rotEl.setAttribute('aria-label', 'Rotation');
  overlay.appendChild(rotEl);
  rotEl.addEventListener('pointerdown', e => startGesture(e, 'rotate'));

  function itemScreenBox(it) {
    const pr = page.getBoundingClientRect(), s = scale();
    return { left: pr.left + it.x * s, top: pr.top + it.y * s, w: it.w * s, h: it.h * s, s };
  }

  function reposition() {
    if (gesture) return; // pendant un geste, l'overlay suit via liveUpdate
    if (pageMode) { positionOverlayOnPage(); return; }
    const it = sel();
    if (!it || cropMode && it.type !== 'image') { overlay.hidden = true; syncMetrics(); return; }
    const b = itemScreenBox(it);
    const ar = area.getBoundingClientRect();
    overlay.hidden = false;
    overlay.classList.toggle('p3-pagemode', false);
    overlay.style.left = (b.left - ar.left + b.w / 2) + 'px';
    overlay.style.top = (b.top - ar.top + b.h / 2) + 'px';
    overlay.style.transform = `rotate(${it.rotation || 0}deg)`;
    box.style.left = (-b.w / 2) + 'px'; box.style.top = (-b.h / 2) + 'px';
    box.style.width = b.w + 'px'; box.style.height = b.h + 'px';
    cropBtn.hidden = it.type !== 'image';
    positionHandles(it, b);
    tools.style.left = (-b.w / 2) + 'px';
    if (b.h < 60 || cropMode) tools.style.top = (b.h / 2 + 6) + 'px'; else tools.style.top = (-b.h / 2 - 34) + 'px';
    rotEl.style.display = cropMode ? 'none' : '';
    syncMetrics();
  }

  function positionHandles(it, b) {
    rotEl.style.top = (-b.h / 2 - 30) + 'px'; rotEl.style.left = '0px';
    const crop = cropMode ? normalizeCrop(it.crop) : null;
    for (const h of HANDLES) {
      const el = handleEls.get(h);
      let fx = h.includes('w') ? -0.5 : h.includes('e') ? 0.5 : 0;
      let fy = h.includes('n') ? -0.5 : h.includes('s') ? 0.5 : 0;
      if (crop) { // les poignées de recadrage suivent la fenêtre visible
        fx = h.includes('w') ? crop.l - 0.5 : h.includes('e') ? 0.5 - crop.r : 0;
        fy = h.includes('n') ? crop.t - 0.5 : h.includes('s') ? 0.5 - crop.b : 0;
        el.classList.add('p3-crop'); el.title = 'Recadrer (' + h + ')';
      } else { el.classList.remove('p3-crop'); el.title = 'Redimensionner (' + h + ')'; }
      el.style.left = (fx * b.w) + 'px'; el.style.top = (fy * b.h) + 'px';
    }
  }

  function positionOverlayOnPage() {
    const pr = page.getBoundingClientRect(), ar = area.getBoundingClientRect();
    overlay.hidden = false; overlay.classList.add('p3-pagemode');
    overlay.style.left = (pr.left - ar.left + pr.width / 2) + 'px';
    overlay.style.top = (pr.top - ar.top + pr.height / 2) + 'px';
    overlay.style.transform = 'none';
    box.style.left = (-pr.width / 2) + 'px'; box.style.top = (-pr.height / 2) + 'px';
    box.style.width = pr.width + 'px'; box.style.height = pr.height + 'px';
    for (const h of HANDLES) {
      const el = handleEls.get(h);
      const fx = h.includes('w') ? -0.5 : h.includes('e') ? 0.5 : 0;
      const fy = h.includes('n') ? -0.5 : h.includes('s') ? 0.5 : 0;
      el.style.left = (fx * pr.width) + 'px'; el.style.top = (fy * pr.height) + 'px';
      el.classList.remove('p3-crop');
    }
    rotEl.style.display = 'none';
    tools.style.left = (-pr.width / 2) + 'px'; tools.style.top = (pr.height / 2 + 6) + 'px';
    cropBtn.hidden = true;
    syncMetrics();
  }

  // — Gestes : 1 transaction par geste, Échap annule, aucune dérive au zoom —
  function startGesture(e, handle) {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const it = sel();
    if (pageMode) {
      gesture = { kind: 'page', handle, itemId: null, initial: { ...geom() }, snapshotDone: false, startScreen: { x: e.clientX, y: e.clientY } };
    } else if (handle === 'rotate') {
      if (!it) return;
      const b = itemScreenBox(it);
      gesture = { kind: 'rotate', itemId: it.id, initial: { ...it }, snapshotDone: false, startScreen: { x: e.clientX, y: e.clientY }, centerScreen: { x: b.left + b.w / 2, y: b.top + b.h / 2 } };
    } else if (cropMode && it?.type === 'image') {
      gesture = { kind: 'crop', handle, itemId: it.id, initial: { ...it }, initialCrop: normalizeCrop(it.crop), snapshotDone: false, startScreen: { x: e.clientX, y: e.clientY } };
    } else {
      if (!it) return;
      gesture = { kind: 'resize', handle, itemId: it.id, initial: { ...it }, snapshotDone: false, startScreen: { x: e.clientX, y: e.clientY } };
    }
    liveBox = pageMode ? null : itemScreenBox(it);
    const target = e.target;
    target.setPointerCapture(e.pointerId);
    target.onpointermove = onGestureMove;
    target.onpointerup = endGesture;
    target.onpointercancel = cancelGesture;
  }

  function snapshotOnce() {
    if (!gesture || gesture.snapshotDone) return;
    host.snapshot(); // capture l'état antérieur complet (objets + page) — une seule fois par geste
    gesture.snapshotDone = true;
  }

  function onGestureMove(ev) {
    if (!gesture) return;
    const s = scale();
    const dxs = ev.clientX - gesture.startScreen.x, dys = ev.clientY - gesture.startScreen.y;
    if (Math.abs(dxs) + Math.abs(dys) > 1) snapshotOnce();

    if (gesture.kind === 'page') {
      const dx = dxs / s, dy = dys / s;
      let { width, height } = gesture.initial;
      if (gesture.handle.includes('e')) width = gesture.initial.width + dx;
      if (gesture.handle.includes('w')) width = gesture.initial.width - dx;
      if (gesture.handle.includes('s')) height = gesture.initial.height + dy;
      if (gesture.handle.includes('n')) height = gesture.initial.height - dy;
      host.applyPageSize(Math.max(50, Math.round(width)), Math.max(50, Math.round(height)));
      liveBox = null; positionOverlayOnPage(); scheduleMetrics(); drawRulers();
      return;
    }

    const it = host.getItems().find(i => i.id === gesture.itemId) || sel(); if (!it) return;
    if (gesture.kind === 'rotate') {
      const deg = rotationFromPointer(gesture.centerScreen, gesture.startScreen, { x: ev.clientX, y: ev.clientY }, gesture.initial.rotation || 0, ev.shiftKey ? 15 : 0);
      it.rotation = deg;
      applyLiveStyle(it); scheduleMetrics();
      return;
    }
    if (gesture.kind === 'crop') {
      it.crop = applyCropDrag(gesture.initialCrop, gesture.handle, dxs / s, dys / s, gesture.initial.w, gesture.initial.h);
      applyLiveStyle(it);
      const b = itemScreenBox(it); positionHandles(it, b); scheduleMetrics();
      return;
    }
    // resize
    const d = toLocalDelta(dxs, dys, s, gesture.initial.rotation || 0);
    const lock = ev.shiftKey ? !ratioLock : ratioLock;
    let r = applyHandleDrag(gesture.initial, gesture.handle, d, { lockRatio: lock, fromCenter: ev.altKey });
    const theta = gesture.initial.rotation || 0;
    let guide = { guideX: null, guideY: null };
    if (snapOn()) {
      const targets = snapTargetsFor(host.getItems(), it.id, geom().width, geom().height);
      const tol = SNAP_TOLERANCE_SCREEN / s; // tolérance écran → unités page : identique à tout zoom
      if (!theta) {
        const res = snapResize(r, gesture.handle, targets, tol);
        r = res.rect; guide = res;
        if (lock && gesture.handle.length === 2) { // le verrouillage de ratio prime sur le snap
          const ratio0 = gesture.initial.w / gesture.initial.h;
          if (Math.abs(r.w - r.h * ratio0) > 0.01) { r.h = r.w / ratio0; guide.guideY = null; }
        }
      } else {
        // P3-L1 : snap actif sous rotation (repère objet + document, point fixe préservé)
        const res = snapResizeRotated(gesture.initial, gesture.handle, d, targets, tol, { lockRatio: lock, fromCenter: ev.altKey });
        r = res.rect; guide = res;
      }
    }
    it.x = Math.round(r.x * 100) / 100; it.y = Math.round(r.y * 100) / 100;
    it.w = Math.round(r.w * 100) / 100; it.h = Math.round(r.h * 100) / 100;
    showGuides(guide.guideX, guide.guideY);
    applyLiveStyle(it);
    const b = itemScreenBox(it);
    box.style.left = (-b.w / 2) + 'px'; box.style.top = (-b.h / 2) + 'px';
    box.style.width = b.w + 'px'; box.style.height = b.h + 'px';
    const ar = area.getBoundingClientRect();
    overlay.style.left = (b.left - ar.left + b.w / 2) + 'px';
    overlay.style.top = (b.top - ar.top + b.h / 2) + 'px';
    positionHandles(it, b);
    scheduleMetrics();
  }

  function applyLiveStyle(it) {
    const el = page.querySelector(`.element[data-id="${CSS.escape(it.id)}"]`);
    if (!el) return;
    Object.assign(el.style, { left: it.x + 'px', top: it.y + 'px', width: it.w + 'px', height: it.h + 'px', transform: `rotate(${it.rotation || 0}deg)` });
    const img = el.querySelector('img');
    if (img && it.crop) {
      const st = cropImgStyle(it.crop, it.w, it.h);
      img.style.cssText = `position:absolute;max-width:none;width:${st.width}px;height:${st.height}px;left:${st.left}px;top:${st.top}px;object-fit:fill`;
    }
  }

  function endGesture(ev) {
    const g = gesture; gesture = null;
    if (ev?.target) { ev.target.onpointermove = null; ev.target.onpointerup = null; }
    clearGuides();
    if (g?.snapshotDone) { host.render(); } // commit : re-render + champ numériques
    reposition(); drawRulers();
  }

  function cancelGesture() { // pointercancel : même annulation qu'Échap
    if (!gesture) return;
    restoreGesture(); gesture = null; clearGuides(); reposition();
  }

  function restoreGesture() {
    if (!gesture || !gesture.snapshotDone) return;
    if (gesture.kind === 'page') { host.applyPageSize(gesture.initial.width, gesture.initial.height); }
    else {
      const it = host.getItems().find(i => i.id === gesture.itemId); // robuste : la sélection peut être effacée entre-temps
      if (it) { Object.assign(it, gesture.initial); if (gesture.kind === 'crop') it.crop = gesture.initialCrop; applyLiveStyle(it); }
    }
    host.undoQuiet?.(); // retire l'entrée d'historique du geste annulé (aucune modification nette)
  }

  // Capture : Échap doit annuler le geste AVANT le handler historique qui efface la sélection.
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (gesture) { e.preventDefault(); e.stopPropagation(); restoreGesture(); gesture = null; clearGuides(); host.render(); reposition(); }
    else if (cropMode) { setCropMode(false); }
  }, true);

  // Clavier sur les poignées : flèches redimensionnent d'1 px (Maj = 10 px)
  function handleKeyResize(e, handle) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const it = sel(); if (!it || pageMode) return;
    e.preventDefault(); e.stopPropagation();
    const step = (e.shiftKey ? 10 : 1);
    const d = { x: (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), y: (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) };
    host.snapshot();
    const r = applyHandleDrag({ ...it }, handle, d, { lockRatio: ratioLock });
    Object.assign(it, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
    host.render();
  }

  function setCropMode(on) {
    cropMode = on && sel()?.type === 'image';
    cropBtn.textContent = cropMode ? '✓ Terminer le recadrage' : '⧉ Recadrer';
    cropBtn.setAttribute('aria-pressed', String(cropMode));
    const st = document.getElementById('status');
    if (st && cropMode) st.textContent = 'Recadrage : tirez les poignées pour définir la fenêtre visible. Échap pour quitter.';
    reposition();
  }

  // — Guides de snap (réutilise le style flyer-7m) —
  let guideX = null, guideY = null;
  function showGuides(x, y) {
    const pr = page.getBoundingClientRect(), ar = area.getBoundingClientRect(), s = scale();
    if (x != null) { if (!guideX) { guideX = document.createElement('div'); guideX.className = 'fly-7m-guide vertical'; guideX.style.position = 'absolute'; area.appendChild(guideX); } guideX.style.left = (pr.left - ar.left + x * s) + 'px'; guideX.style.top = (pr.top - ar.top) + 'px'; guideX.style.height = pr.height + 'px'; guideX.style.bottom = 'auto'; }
    else { guideX?.remove(); guideX = null; }
    if (y != null) { if (!guideY) { guideY = document.createElement('div'); guideY.className = 'fly-7m-guide horizontal'; guideY.style.position = 'absolute'; area.appendChild(guideY); } guideY.style.top = (pr.top - ar.top + y * s) + 'px'; guideY.style.left = (pr.left - ar.left) + 'px'; guideY.style.width = pr.width + 'px'; guideY.style.right = 'auto'; }
    else { guideY?.remove(); guideY = null; }
  }
  function clearGuides() { guideX?.remove(); guideY?.remove(); guideX = guideY = null; }

  const snapOn = () => (window.__flyer7mIsSnapEnabled ? window.__flyer7mIsSnapEnabled() : true);

  // — Correctif snap déplacement : cibles dynamiques (géométrie courante) + tolérance zoom —
  window.__flyer7mSnapSingle = (it, x, y) => {
    if (!snapOn()) { clearGuides(); return { x, y }; }
    const targets = snapTargetsFor(host.getItems(), it.id, geom().width, geom().height);
    const tol = SNAP_TOLERANCE_SCREEN / scale();
    const sx = snapDelta([x, x + it.w / 2, x + it.w], targets.x, tol);
    const sy = snapDelta([y, y + it.h / 2, y + it.h], targets.y, tol);
    showGuides(sx?.target ?? null, sy?.target ?? null);
    return { x: x + (sx?.delta || 0), y: y + (sy?.delta || 0) };
  };
  page.addEventListener('pointerup', clearGuides, true);

  // — Mode page explicite (§6.2 : distinct du zoom) —
  const pageToggle = document.createElement('button');
  pageToggle.id = 'p3-page-toggle'; pageToggle.type = 'button';
  pageToggle.textContent = '⛶ Page'; pageToggle.title = 'Mode « Redimensionner la page » : les poignées agissent sur la page (distinct du zoom et du changement de format)';
  pageToggle.setAttribute('aria-pressed', 'false');
  pageToggle.onclick = () => setPageMode(!pageMode);
  const zoomLabel = document.getElementById('zoomLabel');
  (zoomLabel?.parentElement || document.querySelector('.canvasbar'))?.appendChild(pageToggle);

  // — Phase 4.1 (P4.1-C) : option explicite « Règles » — affichage/masquage fonctionnel,
  // persisté (readox.p3.rulers), désactivé par défaut. La variable rulersVisible est
  // déclarée plus bas dans cette même portée ; le clic n'est possible qu'après l'init.
  const rulersToggle = document.createElement('button');
  rulersToggle.id = 'p3-rulers-toggle'; rulersToggle.type = 'button';
  rulersToggle.textContent = '📏 Règles'; rulersToggle.title = 'Afficher/masquer les règles de précision (désactivées par défaut)';
  rulersToggle.setAttribute('aria-pressed', 'false');
  rulersToggle.onclick = () => { rulersVisible = !rulersVisible; rulersToggle.setAttribute('aria-pressed', String(rulersVisible)); persistRulers(); applyRulersVisibility(); };
  (zoomLabel?.parentElement || document.querySelector('.canvasbar'))?.appendChild(rulersToggle);

  function setPageMode(on) {
    pageMode = on;
    pageToggle.setAttribute('aria-pressed', String(on));
    const st = document.getElementById('status');
    if (st) st.textContent = on ? 'Mode page : tirez les poignées orange pour redimensionner la page (objets non mis à l’échelle — voir Formats pour adapter le contenu).' : '';
    reposition();
  }

  // — Panneau de métriques temps réel (§6.2) + sélecteur d'unité d'affichage —
  const panel = document.createElement('section'); panel.id = 'p3-metrics';
  panel.innerHTML = `<h2>Métriques <select id="p3-unit" aria-label="Unité d'affichage">${UNITS.map(u => `<option value="${u}">${u}</option>`).join('')}</select></h2>
    <div class="p3-grid">
      <div><label for="p3-mx">X</label><input id="p3-mx" type="number" step="any"></div>
      <div><label for="p3-my">Y</label><input id="p3-my" type="number" step="any"></div>
      <div><label for="p3-mw">Largeur</label><input id="p3-mw" type="number" step="any" min="1"></div>
      <div><label for="p3-mh">Hauteur</label><input id="p3-mh" type="number" step="any" min="1"></div>
      <div><label for="p3-mr">Rotation (°)</label><input id="p3-mr" type="number" step="1"></div>
      <div class="p3-ro" id="p3-mratio">Ratio : <b>—</b></div>
      <div class="p3-ro" id="p3-mscale">Échelle : <b>—</b></div>
      <div class="p3-ro" id="p3-manchor">Ancrage : <b>—</b></div>
      <div class="p3-ro" id="p3-mmarges">Marges : <b>—</b></div>
      <div class="p3-ro" id="p3-mguides">Guides : <b>—</b></div>
    </div>
    <div class="p3-lock"><input type="checkbox" id="p3-lock"><label for="p3-lock" style="margin:0">Verrouiller le ratio au coin</label></div>`;
  props.insertBefore(panel, props.firstChild);
  const unitSel = panel.querySelector('#p3-unit');
  unitSel.value = unit; // réglage persisté restauré
  unitSel.onchange = () => { unit = unitSel.value; persistUnit(); announceUnit(); syncMetrics(); drawRulers(); }; // affichage seul : valeurs canoniques intactes
  const lockChk = panel.querySelector('#p3-lock');
  lockChk.onchange = () => { ratioLock = lockChk.checked; syncLock(); };
  const F = { x: panel.querySelector('#p3-mx'), y: panel.querySelector('#p3-my'), w: panel.querySelector('#p3-mw'), h: panel.querySelector('#p3-mh'), r: panel.querySelector('#p3-mr') };
  for (const [k, el] of Object.entries(F)) {
    el.addEventListener('change', () => {
      const it = sel(); if (!it) return;
      const vPx = k === 'r' ? Number(el.value) : toPxSafe(Number(el.value));
      if (!Number.isFinite(vPx)) return;
      host.snapshot();
      if (k === 'r') it.rotation = ((vPx % 360) + 360) % 360;
      else if (k === 'w' || k === 'h') it[k] = Math.max(1, vPx);
      else it[k] = vPx;
      host.render(); reposition(); drawRulers();
    });
  }
  const toPxSafe = v => { try { return toPx(v, unit); } catch { return v; } };
  const fmt = vPx => {
    const v = unit === 'px' ? vPx : fromPx(vPx, unit);
    return Math.round(v * 100) / 100;
  };

  // — P3-L2 : unification des unités sur les champs historiques (#x/#y/#w/#h du
  // panneau Propriétés). Source unique de conversion : formats/units.mjs via
  // fmt/toPx ci-dessus — aucun second moteur, aucune double conversion :
  // · affichage : syncLegacyFields() réécrit les valeurs dans l'unité courante ;
  // · saisie : la valeur saisie est convertie en px AVANT le gestionnaire
  //   historique, qui reste l'unique scripteur du canonique (px).
  // NB : à la cible (AT_TARGET), les écouteurs s'exécutent dans l'ordre
  // d'enregistrement — la conversion doit donc se faire en phase de CAPTURE
  // sur un ANCÊTRE (l'événement change bouillonne), pas sur le champ lui-même.
  const legacyGeo = {};
  for (const k of ['x', 'y', 'w', 'h']) {
    const el = document.getElementById(k);
    if (!el || el.closest('#p3-metrics') || !el.closest('#fields')) continue; // champs historiques uniquement
    const label = el.previousElementSibling;
    if (label && label.tagName === 'LABEL' && !label.dataset.p3Base) label.dataset.p3Base = label.textContent;
    legacyGeo[k] = { el, label };
  }
  document.addEventListener('change', e => {
    for (const f of Object.values(legacyGeo)) {
      if (f.el !== e.target) continue;
      const v = Number(f.el.value);
      if (!Number.isFinite(v) || unit === 'px') return; // px : comportement historique inchangé
      try { f.el.value = String(Math.round(toPx(v, unit) * 100) / 100); } catch { /* unité inconnue : valeur historique conservée */ }
      return;
    }
  }, true);
  function syncLegacyFields() {
    const it = sel();
    for (const [k, f] of Object.entries(legacyGeo)) {
      if (f.label) f.label.textContent = `${f.label.dataset.p3Base} (${unit})`;
      if (document.activeElement !== f.el) f.el.value = it ? fmt(it[k]) : '';
    }
  }

  let metricsScheduled = false;
  function scheduleMetrics() { // cadence contrôlée : une mise à jour par frame pendant le geste
    if (metricsScheduled) return;
    metricsScheduled = true;
    requestAnimationFrame(() => { metricsScheduled = false; syncMetrics(); });
  }

  function syncMetrics() {
    if (gesture && gesture.kind !== 'page') { /* valeurs lues depuis l'objet en cours */ }
    syncLegacyFields(); // P3-L2 : champs historiques synchronisés (même unité, mêmes arrondis)
    const it = sel();
    const g = geom();
    if (pageMode || !it) {
      for (const el of Object.values(F)) { el.value = ''; el.disabled = true; }
      panel.querySelector('#p3-mratio').innerHTML = `Ratio : <b>${ratioLabel(g.width, g.height)}</b>`;
      panel.querySelector('#p3-mscale').innerHTML = `Échelle : <b>${Math.round(scale() * 100)} %</b>`;
      panel.querySelector('#p3-manchor').innerHTML = 'Ancrage : <b>page</b>';
      panel.querySelector('#p3-mmarges').innerHTML = `Page : <b>${fmt(g.width)}×${fmt(g.height)} ${unit}</b>`;
      panel.querySelector('#p3-mguides').innerHTML = 'Guides : <b>—</b>';
      return;
    }
    for (const el of Object.values(F)) el.disabled = false;
    if (document.activeElement !== F.x) F.x.value = fmt(it.x);
    if (document.activeElement !== F.y) F.y.value = fmt(it.y);
    if (document.activeElement !== F.w) F.w.value = fmt(it.w);
    if (document.activeElement !== F.h) F.h.value = fmt(it.h);
    if (document.activeElement !== F.r) F.r.value = it.rotation || 0;
    const m = metricsFor(it, g.width, g.height);
    panel.querySelector('#p3-mratio').innerHTML = `Ratio : <b>${ratioLabel(it.w, it.h)}</b>`;
    const sc = gesture && gesture.initial.w ? it.w / gesture.initial.w : 1;
    panel.querySelector('#p3-mscale').innerHTML = `Échelle : <b>${Math.round(sc * 100)} %</b>`;
    const anchorMap = { nw: 'sud-est', n: 'sud', ne: 'sud-ouest', e: 'ouest', se: 'nord-ouest', s: 'nord', sw: 'nord-est', w: 'est' };
    panel.querySelector('#p3-manchor').innerHTML = `Ancrage : <b>${gesture?.handle ? anchorMap[gesture.handle] || '—' : 'nord-ouest (position)'}</b>`;
    panel.querySelector('#p3-mmarges').innerHTML = `Marges : <b>g ${fmt(m.marges.l)} · h ${fmt(m.marges.t)} · d ${fmt(m.marges.r)} · b ${fmt(m.marges.b)}</b>`;
    if (snapOn()) {
      const t = snapTargetsFor(host.getItems(), it.id, g.width, g.height);
      const dx = snapDelta([it.x, it.x + it.w / 2, it.x + it.w], t.x, 1e9);
      const dy = snapDelta([it.y, it.y + it.h / 2, it.y + it.h], t.y, 1e9);
      panel.querySelector('#p3-mguides').innerHTML = `Guides : <b>Δx ${dx ? fmt(dx.delta) : '—'} · Δy ${dy ? fmt(dy.delta) : '—'}</b>`;
    } else panel.querySelector('#p3-mguides').innerHTML = 'Guides : <b>magnétisme désactivé</b>';
  }

  // — Règles graduées (unité d'affichage courante, synchronisées zoom/pan) —
  const rulerH = document.createElement('canvas'); rulerH.id = 'p3-ruler-h'; rulerH.className = 'p3-ruler';
  const rulerV = document.createElement('canvas'); rulerV.id = 'p3-ruler-v'; rulerV.className = 'p3-ruler';
  const corner = document.createElement('canvas'); corner.id = 'p3-ruler-corner'; corner.className = 'p3-ruler';
  area.append(rulerH, rulerV, corner);
  const barH = document.querySelector('.canvasbar')?.offsetHeight || 53;
  rulerH.style.top = barH + 'px';
  rulerV.style.top = (barH + 24) + 'px';
  corner.style.top = barH + 'px';
  const rulerVTop = () => Number.parseFloat(rulerV.style.top) || (barH + 24);

  // — Phase 4.1 (P4.1-C) : règles MASQUÉES PAR DÉFAUT — option explicite persistée,
  // réversible, identique sur ordinateur et téléphone. Aucune barre ne chevauche
  // plus la page sans demande de l'utilisateur.
  let rulersVisible = (() => { try { return localStorage.getItem('readox.p3.rulers') === '1'; } catch { return false; } })();
  const persistRulers = () => { try { localStorage.setItem('readox.p3.rulers', rulersVisible ? '1' : '0'); } catch { /* stockage indisponible */ } };
  const applyRulersVisibility = () => { for (const r of [rulerH, rulerV, corner]) r.style.display = rulersVisible ? '' : 'none'; if (rulersVisible) drawRulers(); };

  function drawRulers() {
    if (!rulersVisible) return; // P4.1-C : règles masquées par défaut — rien à dessiner
    const pr = page.getBoundingClientRect(), ar = area.getBoundingClientRect(), s = scale();
    const dpr = window.devicePixelRatio || 1;
    const unitPx = toPx(1, unit); // px page par unité d'affichage
    const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];
    const step = steps.find(v => v * unitPx * s >= 45) || 5000;
    const g = geom();
    // P3-L3 : l'origine reste dans les limites de la page (changement de format compris)
    rulerOrigin.x = Math.max(0, Math.min(g.width, rulerOrigin.x));
    rulerOrigin.y = Math.max(0, Math.min(g.height, rulerOrigin.y));
    for (const [cv, horizontal] of [[rulerH, true], [rulerV, false]]) {
      const w = horizontal ? area.clientWidth - 24 : 24, h = horizontal ? 24 : area.clientHeight - (barH + 24);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#8fb8dd'; ctx.strokeStyle = '#27435f'; ctx.font = '9px Arial'; ctx.textBaseline = 'top';
      const origin = horizontal ? pr.left - ar.left - 24 : pr.top - ar.top - rulerVTop();
      const o = horizontal ? rulerOrigin.x : rulerOrigin.y; // origine documentaire (unités page)
      const len = horizontal ? w : h;
      for (let p = 0; p < len; p += 2) {
        const pagePos = (p - origin) / s; // px page (absolu, pour le bornage)
        const u = (pagePos - o) / unitPx; // graduation relative à l'origine
        if (pagePos < -step * unitPx || pagePos > (horizontal ? g.width : g.height) + step * unitPx) continue;
        const major = Math.abs(u / step - Math.round(u / step)) < (1 / (unitPx * s)) / 2;
        if (!major) continue;
        const uu = Math.round(u / step) * step;
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(p, 24); ctx.lineTo(p, 10); ctx.fillText(String(uu), p + 2, 1); }
        else { ctx.moveTo(24, p); ctx.lineTo(10, p); ctx.save(); ctx.translate(1, p + 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(String(uu), 0, 0); ctx.restore(); ctx.textAlign = 'left'; }
        ctx.stroke();
      }
    }
    const cctx = corner.getContext('2d');
    corner.width = 24 * dpr; corner.height = 24 * dpr; cctx.scale(dpr, dpr);
    cctx.fillStyle = '#0a1a2e'; cctx.fillRect(0, 0, 24, 24);
    cctx.fillStyle = '#8fb8dd'; cctx.font = '9px Arial'; cctx.fillText(unit, 3, 14);
    if (rulerOrigin.x !== 0 || rulerOrigin.y !== 0) { // origine déplacée : repère visible
      cctx.fillStyle = '#31eaff'; cctx.beginPath(); cctx.arc(19, 5, 2.5, 0, Math.PI * 2); cctx.fill();
    }
  }

  // — P3-L3 : définition de l'origine depuis l'équerre (coin des règles) —
  // glisser : place l'origine au point page visé (guides croisés pendant le geste) ;
  // double-clic : réinitialise à l'angle supérieur gauche. Aucun objet n'est déplacé
  // (affichage seul) ; l'origine est persistée comme réglage documentaire.
  corner.style.pointerEvents = 'auto'; corner.style.cursor = 'crosshair';
  corner.title = 'Glisser pour définir l’origine des règles · double-clic pour réinitialiser';
  corner.setAttribute('aria-label', 'Origine des règles : glisser pour définir, double-clic pour réinitialiser');
  function setRulerOrigin(o) {
    const g = geom();
    rulerOrigin = { x: Math.max(0, Math.min(g.width, o.x)), y: Math.max(0, Math.min(g.height, o.y)) };
    persistOrigin(); drawRulers();
    document.dispatchEvent(new CustomEvent('readox:flyer:ruler-origin-changed', { detail: { ...rulerOrigin } }));
  }
  let originDrag = null;
  corner.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    originDrag = true; corner.setPointerCapture(e.pointerId);
  });
  corner.addEventListener('pointermove', e => {
    if (!originDrag) return;
    const pr = page.getBoundingClientRect(), s = scale();
    const px = (e.clientX - pr.left) / s, py = (e.clientY - pr.top) / s;
    showGuides(px, py); // guides croisés à la position visée
  });
  const endOriginDrag = e => {
    if (!originDrag) return;
    originDrag = null; clearGuides();
    if (!e || e.type !== 'pointerup') return;
    const pr = page.getBoundingClientRect(), s = scale();
    setRulerOrigin({ x: Math.round(((e.clientX - pr.left) / s) * 100) / 100, y: Math.round(((e.clientY - pr.top) / s) * 100) / 100 });
  };
  corner.addEventListener('pointerup', endOriginDrag);
  corner.addEventListener('pointercancel', () => { originDrag = null; clearGuides(); }); // annulation : origine inchangée
  corner.addEventListener('dblclick', e => { e.preventDefault(); setRulerOrigin({ x: 0, y: 0 }); });

  // — Raccordements : render/select/zoom/scroll/redimensionnement —
  const prevRender = window.render;
  window.render = function (...a) { const r = prevRender?.apply(this, a); if (!gesture) reposition(); drawRulers(); return r; };
  const prevSelect = window.select;
  window.select = function (...a) { const r = prevSelect?.apply(this, a); if (cropMode && sel()?.type !== 'image') setCropMode(false); reposition(); return r; };
  const prevZoom = window.setZoom;
  if (typeof prevZoom === 'function') window.setZoom = function (...a) { const r = prevZoom.apply(this, a); reposition(); drawRulers(); return r; };
  scroll.addEventListener('scroll', () => { reposition(); drawRulers(); }, { passive: true });
  window.addEventListener('resize', () => { reposition(); drawRulers(); });
  document.addEventListener('readox:flyer:format-changed', () => setTimeout(() => { reposition(); drawRulers(); }, 30));
  document.addEventListener('readox:flyer:model-opened', () => setTimeout(() => { reposition(); drawRulers(); }, 60));
  document.addEventListener('readox:flyer:zoom-changed', () => { reposition(); drawRulers(); }); // Phase 4.1 : zoom via API unifiée
  applyRulersVisibility(); // P4.1-C : état initial = préférence persistée (masqué par défaut)
  rulersToggle.setAttribute('aria-pressed', String(rulersVisible));
  new MutationObserver(() => { if (!gesture) reposition(); drawRulers(); }).observe(page, { attributes: true, attributeFilter: ['style'] });

  window.ReadoxP3 = {
    version: '3.1.0', overlay, panel,
    isPageMode: () => pageMode, setPageMode,
    isCropMode: () => cropMode, setCropMode,
    setUnit: u => { if (!UNITS.includes(u)) return; unit = u; unitSel.value = u; persistUnit(); announceUnit(); syncMetrics(); drawRulers(); },
    getUnit: () => unit,
    setRatioLock: v => { ratioLock = !!v; lockChk.checked = ratioLock; syncLock(); },
    getRulerOrigin: () => ({ ...rulerOrigin }),
    setRulerOrigin: o => setRulerOrigin({ x: Number(o?.x) || 0, y: Number(o?.y) || 0 }),
    resetRulerOrigin: () => setRulerOrigin({ x: 0, y: 0 }),
    reposition, drawRulers,
  };
  window.__readoxP3Handles = true;
  // Rendu DOM du recadrage pour le render() historique (fenêtre visible)
  window.__readoxP3CropCssText = it => {
    const st = cropImgStyle(it.crop, it.w, it.h);
    return `position:absolute;max-width:none;width:${st.width}px;height:${st.height}px;left:${st.left}px;top:${st.top}px;object-fit:fill`;
  };

  reposition(); drawRulers();
  return true;
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => installP3Interactions(), { once: true });
  else installP3Interactions();
}
