/** GF-05B integration: canonical document lifecycle and guarded legacy interoperability. */
import {DocumentStore,newDocument,clone,serialize} from './gf05a/document-core.mjs';
import {migrateLegacy} from './gf05a/document-migrations.mjs';
import {toFabricSource} from './gf05a/document-fabric-adapter.mjs';
import {validateDocument} from './gf05a/document-validator.mjs';
const api=window.__readoxFlyerPhase8;
const state=window.__readoxGF011State;
const KEY='readox-gf05b-canonical-backup';
const canonicalSource=()=>window.__readoxGF05C?.snapshot?.()||null;
const events=[];
let store=new DocumentStore(newDocument()),busy=false,last='',timer=0;
const report=(code,message,details={})=>{const event={code,message,...details};events.push(event);if(events.length>100)events.shift();document.dispatchEvent(new CustomEvent('readox:gf05b:diagnostic',{detail:event}));return event;};
function fromLegacy(raw){const converted=migrateLegacy(raw);const check=validateDocument(converted.document);if(!check.ok)throw Error(check.errors.map(x=>x.code).join(','));return converted;}
function commit(raw,reason='edit'){
 const {document,warnings}=fromLegacy(raw);
 const signature=serialize(document);if(signature===last)return store.snapshot();
 // preserve canonical-only metadata, relations and constraints when the legacy editor changes visual objects.
 const previous=store.snapshot();if(previous?.pages?.length&&reason==='edit'){
  document.relations=(previous.relations||[]).filter(r=>document.nodes[r.from]&&document.nodes[r.to]);
  document.constraints=(previous.constraints||[]).filter(c=>document.nodes[c.nodeId]);
  document.extensions={...previous.extensions,...document.extensions};
  for(const [id,node] of Object.entries(document.nodes))if(previous.nodes[id]){
   const old=previous.nodes[id];node.role=old.role;node.children=old.children.filter(c=>document.nodes[c]);
   node.parentId=old.parentId&&document.nodes[old.parentId]?old.parentId:null;
   node.layerId=old.layerId;node.extensions={...old.extensions,...node.extensions};
  }
 }
 const valid=validateDocument(document);if(!valid.ok)throw Error(valid.errors.map(e=>e.code).join(','));
 store.transact(d=>{for(const key of Object.keys(d))delete d[key];Object.assign(d,clone(document));},validateDocument);
 last=serialize(document);if(warnings.length)report('MIGRATION_WARNINGS',`${warnings.length} conversions`,{warnings});
 documentEvent(reason);return store.snapshot();
}
function documentEvent(reason){document.dispatchEvent(new CustomEvent('readox:gf05b:document',{detail:{reason,nodes:Object.keys(store.data.nodes).length}}));}
function refresh(reason='edit'){if(busy)return;try{const raw=api.capture();commit(raw,reason);}catch(e){report('SYNC_ERROR',e.message);}}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>refresh(),100);}
function open(raw){if(busy)throw Error('Opération déjà en cours');const migrated=fromLegacy(raw);const previous=store.snapshot();busy=true;try{
 // Validate BEFORE mutating the existing editor. Legacy editor is the compatibility layer.
 api.restore(toFabricSource(migrated.document).document);
 store=new DocumentStore(migrated.document);last=serialize(migrated.document);documentEvent('open');
 return store.snapshot();
 }catch(e){store=new DocumentStore(previous);last=serialize(previous);report('OPEN_FAILED',e.message);throw e;}finally{busy=false;}}
function snapshot(){refresh();return store.snapshot();}
function undo(){const ok=store.undo();if(ok){const next=store.snapshot();busy=true;try{api.restore(toFabricSource(next).document);last=serialize(next);}finally{busy=false;}}return ok;}
function redo(){const ok=store.redo();if(ok){const next=store.snapshot();busy=true;try{api.restore(toFabricSource(next).document);last=serialize(next);}finally{busy=false;}}return ok;}
function saveBackup(){try{localStorage.setItem(KEY,serialize(snapshot()));return true;}catch(e){report('BACKUP_FAILED',e.message);return false;}}
function loadBackup(){const raw=localStorage.getItem(KEY);if(!raw)return false;open(JSON.parse(raw));return true;}
function diagnostics(){return {version:'GF-05B',nodes:Object.keys(store.data.nodes).length,valid:validateDocument(store.data),events:[...events],fabric:window.__readoxGF011Status||null};}
if(!api?.capture||!api?.restore||!state?.read){report('UNAVAILABLE','Legacy editor unavailable');}
else{
 // Compatibility: leave the original save/export API intact and make canonical access explicit.
 try{refresh('initial');}catch(e){report('INITIAL_ERROR',e.message);}
 const page=document.getElementById('page');if(page){new MutationObserver(m=>{if(m.some(x=>[...x.addedNodes,...x.removedNodes].some(n=>n.nodeType===1&&n.classList?.contains('element'))))schedule();}).observe(page,{childList:true});}
 document.addEventListener('readox:flyer:model-opened',()=>setTimeout(()=>refresh('template'),0));
 document.addEventListener('readox:gf011:status',()=>refresh('fabric'));
 document.getElementById('save')?.addEventListener('click',()=>{refresh('save');saveBackup();},true);
}
window.__readoxGF05B={version:'GF-05B',snapshot,open,openBlank:()=>open({format:'readox-flyer',version:3,page:{width:510,height:660,background:'#fff'},items:[]}),dispatch:(id,patch)=>{if(!state.commit(id,patch))return false;refresh('command');return true;},undo,redo,saveBackup,loadBackup,diagnostics,toLegacy:()=>toFabricSource(snapshot()).document,validate:()=>validateDocument(snapshot())};
document.dispatchEvent(new CustomEvent('readox:gf05b:ready'));
