/** GF-05D incremental transaction bridge. Legacy editor remains authoritative until full migration. */
import {migrateLegacy} from '../gf05a/document-migrations.mjs';
import {validateDocument} from '../gf05a/document-validator.mjs';
const state=window.__readoxGF011State,legacy=window.__readoxFlyerPhase8;
const history=[],future=[],diagnostics=[];let lock=false;
const clone=x=>structuredClone(x);
function record(code,error){diagnostics.push({code,message:String(error?.message||error)});if(diagnostics.length>100)diagnostics.shift();}
function valid(raw){const d=migrateLegacy(raw).document;const v=validateDocument(d);if(!v.ok)throw Error(v.errors.map(x=>x.code).join(','));return d;}
function capture(){if(!legacy?.capture)throw Error('LEGACY_CAPTURE_UNAVAILABLE');return clone(legacy.capture());}
function restore(raw){if(!legacy?.restore)throw Error('LEGACY_RESTORE_UNAVAILABLE');legacy.restore(clone(raw));}
function transact(callback,label='edit'){
 if(lock)throw Error('TRANSACTION_REENTRANT');const before=capture();valid(before);lock=true;
 try{const result=callback();valid(capture());history.push({before,label});if(history.length>100)history.shift();future.length=0;document.dispatchEvent(new CustomEvent('readox:gf05d:transaction',{detail:{label}}));return result;}
 catch(e){try{restore(before)}catch(rollback){record('ROLLBACK_FAILED',rollback)}record('TRANSACTION_REJECTED',e);throw e}
 finally{lock=false}
}
function patch(id,changes){if(!state?.commit)throw Error('STATE_COMMIT_UNAVAILABLE');const before=state.read().items.find(x=>x.id===id);if(!before)throw Error('OBJECT_NOT_FOUND');if(before.locked)throw Error('OBJECT_LOCKED');if(!changes||typeof changes!=='object'||Array.isArray(changes))throw Error('INVALID_PATCH');for(const key of ['x','y','w','h','rotation','opacity'])if(key in changes&&!Number.isFinite(Number(changes[key])))throw Error('NONFINITE_'+key);if(('w'in changes&&Number(changes.w)<=0)||('h'in changes&&Number(changes.h)<=0))throw Error('INVALID_DIMENSIONS');return transact(()=>state.commit(id,changes),'patch:'+id)}
function travel(from,to){if(lock||!from.length)return false;const entry=from.pop(),current=capture();lock=true;try{restore(entry.before);valid(capture());to.push({before:current,label:entry.label});return true}catch(e){try{restore(current)}catch(rollback){record('ROLLBACK_FAILED',rollback)}from.push(entry);record('HISTORY_FAILED',e);return false}finally{lock=false}}
function inspect(){return {version:'GF-05D-TX-INCREMENTAL',undoDepth:history.length,redoDepth:future.length,diagnostics:[...diagnostics],fabricStatus:window.__readoxGF011Status||null,warning:'Legacy DOM is still the source of truth; not all UI commands are routed here.'}}
window.__readoxGF05DTransactions={patch,transact,undo:()=>travel(history,future),redo:()=>travel(future,history),inspect};
document.dispatchEvent(new CustomEvent('readox:gf05d:transactions-ready'));
