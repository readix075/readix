import {auditLayout,safeTextFixes,applyTextFixes,fitPageToViewport} from './gf03.mjs';
const state=window.__readoxGF011State;
function current(){if(!state?.read)return null;const s=state.read();return {page:{width:510,height:Math.max(660,...(s.items||[]).map(i=>Number(i.y||0)+Number(i.h||0))),background:s.pageBg},items:s.items||[]};}
function measure(text,size,font,weight){const ctx=document.createElement('canvas').getContext('2d');ctx.font=`${weight||'normal'} ${size}px ${font||'Arial'}`;return ctx.measureText(text).width;}
function audit(doc=current()){if(!doc)return [];return auditLayout(doc,{measure});}
window.__readoxGF03={version:'GF-03',audit,propose:()=>{const d=current();return d?safeTextFixes(d,{measure}):[];},previewFixed:()=>{const d=current();return d?applyTextFixes(d,safeTextFixes(d,{measure})):null;},fitPageToViewport};
document.addEventListener('readox:flyer:model-opened',()=>{window.__readoxGF03.lastAudit=audit();document.dispatchEvent(new CustomEvent('readox:gf03:audit',{detail:{issues:window.__readoxGF03.lastAudit}}));});
