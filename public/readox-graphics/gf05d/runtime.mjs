import {auditDocument,checkSvgSource} from './audit.mjs';
import {capabilities} from './capabilities.mjs';
import {fit,resizePage} from './geometry.mjs';
const events=[];const log=(code,detail)=>{events.push({code,detail:String(detail)});if(events.length>100)events.shift();};
function snapshot(){const source=window.__readoxGF05C?.snapshot?.()||window.__readoxGF05B?.snapshot?.();if(!source)throw Error('CANONICAL_SOURCE_UNAVAILABLE');return source;}
function audit(){try{return {...auditDocument(snapshot()),events:[...events],capabilities};}catch(e){log('AUDIT_FAILED',e.message);return {version:'GF-05D',issues:[{code:'CANONICAL_SOURCE_UNAVAILABLE'}],events:[...events]};}}
window.__readoxGF05D={version:'GF-05D-PARTIAL',snapshot,audit,fit,resizePage,checkSvgSource,capabilities,diagnostics:()=>[...events]};
document.dispatchEvent(new CustomEvent('readox:gf05d:ready'));
