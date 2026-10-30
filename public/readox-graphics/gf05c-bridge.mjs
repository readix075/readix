/** GF-05C TEST: validated canonical snapshot and shared render entry. No UI replacement. */
import {migrateLegacy} from './gf05a/document-migrations.mjs';
import {validateDocument} from './gf05a/document-validator.mjs';
import {toFabricSource} from './gf05a/document-fabric-adapter.mjs';
const issues=[];
const report=(code,detail)=>{issues.push({code,detail:String(detail)});if(issues.length>100)issues.shift();};
function snapshot(){
 const legacy=window.__readoxFlyerPhase8;
 if(!legacy?.capture)throw Error('Éditeur indisponible');
 // Synchronize immediately before every render; the editor remains legacy-compatible.
 const current=legacy.capture();
 const migrated=migrateLegacy(current).document;
 const result=validateDocument(migrated);
 if(!result.ok)throw Error('Document invalide : '+result.errors.map(e=>e.code).join(','));
 return migrated;
}
function legacyScene(){const canonical=snapshot();const converted=toFabricSource(canonical);
 if(converted.warnings.length)report('UNSUPPORTED_GROUPS',JSON.stringify(converted.warnings));
 return converted.document;
}
function audit(){const doc=snapshot(),warnings=[];for(const [id,n] of Object.entries(doc.nodes)){
 const g=n.geometry||{},p=doc.pages.find(p=>p.id===n.pageId)||doc.pages[0];
 if(g.x<0||g.y<0||g.x+g.width>p.width||g.y+g.height>p.height)warnings.push({id,code:'PAGE_OVERFLOW'});
 if(n.type==='group'&&n.children?.length)warnings.push({id,code:'GROUP_FIDELITY_REQUIRES_REVIEW'});
 if(n.assetRef&&!doc.assets[n.assetRef])warnings.push({id,code:'MISSING_ASSET'});
 }
 return {version:'GF-05C',nodes:Object.keys(doc.nodes).length,pages:doc.pages.length,warnings,issues:[...issues],fabricStatus:window.__readoxGF011Status||null};
}
window.__readoxGF05C={version:'GF-05C',snapshot,legacyScene,audit,diagnostics:()=>[...issues]};
document.dispatchEvent(new CustomEvent('readox:gf05c:ready'));
