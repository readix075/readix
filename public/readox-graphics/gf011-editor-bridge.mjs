/** GF-01.1 — Fabric canvas mounted inside the EXISTING #page, no toolbar/sidebar replacement.
 * Requires Fabric.js 6 at runtime. If the SDK fails to load, legacy HTML editor stays usable.
 * Images and text remain individual Fabric objects. Model data is canonical in legacy state.
 */
import {createFabricCanvas} from './fabric-adapter.mjs';
const state=window.__readoxGF011State;
const page=document.getElementById('page');
let instance=null, mounted=null, pending=0, busy=false, lastSignature='', active=false;
const emit=(status,detail='')=>{window.__readoxGF011Status={status,detail};document.dispatchEvent(new CustomEvent('readox:gf011:status',{detail:{status,detail}}));};
function read(){return state.read();}
function source(){const s=read();return {format:'readox-flyer',version:3,page:{width:page.clientWidth||510,height:page.clientHeight||660,background:s.pageBg},items:s.items};}
function signature(s){return JSON.stringify(s);}
function hideLegacy(on){page.classList.toggle('gf011-active',on);}
function ensureCSS(){const css=document.createElement('style');css.textContent=`
#page.gf011-active > .element{visibility:hidden!important;pointer-events:none!important}
#page .gf011-host{position:absolute;left:0;top:0;z-index:20;transform:none!important}
#page .gf011-host .canvas-container{position:relative!important}
#page .gf011-host canvas{touch-action:none}
`;document.head.append(css);}
async function sdk(){
 if(window.fabric?.Canvas)return window.fabric;
 // The ZIP contains the adapter, not the proprietary SDK binary. Fetch Fabric 6 on demand.
 const candidates=['https://cdn.jsdelivr.net/npm/fabric@6.7.1/+esm','https://esm.sh/fabric@6.7.1?bundle'];
 let error;
 for(const url of candidates){try{const mod=await import(/* @vite-ignore */url);const f=mod.fabric?.Canvas?mod.fabric:mod;if(f.Canvas&&f.Rect)return f;}catch(e){error=e;}}
 throw Error('Fabric.js inaccessible : '+(error?.message||'réseau ou CSP'));
}
async function setup(fabric,s){
 const host=document.createElement('div');host.className='gf011-host';
 const canvas=document.createElement('canvas');host.append(canvas);page.append(host);
 let created;
 try{created=await createFabricCanvas(fabric,canvas,s,{interactive:true});}
 catch(e){host.remove();throw e;}
 const c=created.canvas;
 c.on('selection:created',ev=>{const id=ev.selected?.[0]?.readoxId;if(id)state.choose(id);});
 c.on('selection:updated',ev=>{const id=ev.selected?.[0]?.readoxId;if(id)state.choose(id);});
 c.on('selection:cleared',()=>{ /* Preserve legacy panel until next explicit selection. */ });
 c.on('object:modified',ev=>{const ob=ev.target,id=ob?.readoxId;if(!id)return;
  busy=true;try{(window.__readoxGF05DTransactions?.patch||state.commit)(id,{x:Math.round(ob.left),y:Math.round(ob.top),w:Math.max(1,Math.round(ob.width*ob.scaleX)),h:Math.max(1,Math.round(ob.height*ob.scaleY)),rotation:ob.angle||0});}finally{busy=false;}
  schedule();
 });
 c.on('text:changed',ev=>{const ob=ev.target;if(!ob?.readoxId)return;busy=true;try{(window.__readoxGF05DTransactions?.patch||state.commit)(ob.readoxId,{text:ob.text});}finally{busy=false;}schedule();});
 return {host,...created};
}
let fabric;
async function update(){if(busy||!fabric||!page)return;const s=source(),sig=signature(s);if(sig===lastSignature&&instance)return;
 if(!s.items.length){if(instance){await instance.destroy();instance.host.remove();instance=null;}hideLegacy(false);lastSignature=sig;return;}
 // Async image loading: never leave a partially rendered canvas covering the legacy editor.
 busy=true;try{
  const next=await setup(fabric,s);
  const previous=instance;instance=next;hideLegacy(true);
  if(previous){await previous.destroy();previous.host.remove();}
  lastSignature=sig;active=true;emit('active',`${s.items.length} objets Fabric`);
 }catch(e){hideLegacy(!!instance);emit('fallback',String(e.message||e));console.warn('[GF-01.1]',e);}finally{busy=false;}
}
function schedule(){clearTimeout(pending);pending=setTimeout(update,130);}
async function start(){if(!page||!state)return emit('fallback','Éditeur ou état introuvable');ensureCSS();
 // Observe DOM changes made by existing render(), including template loading and undo/redo.
 const observer=new MutationObserver(mutations=>{if(mutations.some(m=>[...m.addedNodes,...m.removedNodes].some(n=>n.nodeType===1&&n.classList?.contains('element'))))schedule();});
 observer.observe(page,{childList:true});
 try{fabric=await sdk();emit('sdk-ready','Fabric.js chargé');schedule();}
 catch(e){emit('fallback',e.message);console.warn('[GF-01.1] Le moteur historique reste disponible.',e);}
 window.__readoxGF011={get status(){return window.__readoxGF011Status},get canvas(){return instance?.canvas||null},refresh:schedule,exportPNG:()=>instance?.toPNG(2),exportJPG:()=>instance?.toJPG(2),exportSVG:()=>instance?.toSVG()};
}
start();
