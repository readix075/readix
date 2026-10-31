/** GF-05D.1: isolated canonical v3 controller. No DOM dependencies. */
import {clone,newDocument,serialize} from '../gf05a/document-core.mjs';
import {migrateLegacy} from '../gf05a/document-migrations.mjs';
import {validateDocument} from '../gf05a/document-validator.mjs';
const fail=(code)=>{const e=new Error(code);e.code=code;throw e};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const PATCH_KEYS=new Set(['geometry','transform','appearance','interaction','text','typography','name','role','image','assetRef']);
export class CanonicalController {
 constructor(source,{limit=100}={}){this.doc=this.normalize(source||newDocument());this.revision=0;this.history=[];this.future=[];this.listeners=new Set();this.limit=limit;this.busy=false;this.diagnostics=[];this.selection=[];}
 normalize(source){const doc=source?.format==='readox-graphic-document'?clone(source):migrateLegacy(source).document;const report=validateDocument(doc);if(!report.ok)fail('DOCUMENT_INVALID:'+report.errors.map(e=>e.code).join(','));return doc;}
 getSnapshot(){return clone(this.doc)}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
 getDiagnostics(){return clone(this.diagnostics)}
 transact(fn,{label='edit',expectedRevision=this.revision,selection=this.selection}={}){if(this.busy)fail('TRANSACTION_REENTRANT');if(expectedRevision!==this.revision)fail('STALE_REVISION');this.busy=true;try{const next=clone(this.doc);fn(next);const report=validateDocument(next);if(!report.ok)fail('DOCUMENT_INVALID:'+report.errors.map(e=>e.code).join(','));const before=serialize(this.doc),after=serialize(next);if(before===after)return {changed:false,revision:this.revision};this.history.push({doc:this.doc,selection:clone(this.selection),label});if(this.history.length>this.limit)this.history.shift();this.doc=next;this.selection=clone(selection);this.future=[];this.revision++;this.notify(label);return {changed:true,revision:this.revision};}catch(e){this.diagnostics.push({code:e.code||'TRANSACTION_FAILED',message:e.message});if(this.diagnostics.length>100)this.diagnostics.shift();throw e}finally{this.busy=false}}
 notify(label){for(const fn of [...this.listeners]){try{fn({revision:this.revision,label,document:this.getSnapshot()})}catch(e){this.diagnostics.push({code:'SUBSCRIBER_FAILED',message:e.message})}}}
 dispatch(command){if(!command||typeof command!=='object')fail('INVALID_COMMAND');const {type,payload={},targetIds=[],expectedRevision=this.revision}=command;return this.transact(doc=>{const ids=targetIds.length?targetIds:payload.id?[payload.id]:[];
 if(type==='node.patch'){if(ids.length!==1||!doc.nodes[ids[0]])fail('NODE_NOT_FOUND');const node=doc.nodes[ids[0]];if(node.interaction?.locked)fail('NODE_LOCKED');for(const [k,v] of Object.entries(payload.changes||{})){if(!PATCH_KEYS.has(k))fail('UNSUPPORTED_PROPERTY:'+k);if(['geometry','transform','appearance','interaction','typography','image'].includes(k)){if(!v||typeof v!=='object'||Array.isArray(v))fail('INVALID_PATCH');node[k]={...(node[k]||{}),...clone(v)};}else node[k]=clone(v);}if(node.geometry&&!['x','y','width','height'].every(k=>finite(node.geometry[k])))fail('INVALID_GEOMETRY');if(node.geometry.width<=0||node.geometry.height<=0)fail('INVALID_DIMENSIONS');}
 else if(type==='node.delete'){for(const id of ids){const node=doc.nodes[id];if(!node)fail('NODE_NOT_FOUND');if(node.interaction?.locked)fail('NODE_LOCKED');if(node.children?.length)fail('GROUP_DELETE_REQUIRES_EXPLICIT_POLICY');for(const page of doc.pages)page.rootIds=page.rootIds.filter(x=>x!==id);for(const n of Object.values(doc.nodes))n.children=(n.children||[]).filter(x=>x!==id);delete doc.nodes[id];}}
 else if(type==='page.background'){const page=doc.pages.find(p=>p.id===payload.pageId)||doc.pages[0];if(typeof payload.color!=='string')fail('INVALID_COLOR');page.background=payload.color;}
 else fail('UNSUPPORTED_COMMAND:'+type);
 },{label:type,expectedRevision});}
 undo(){if(this.busy||!this.history.length)return false;const item=this.history.pop();this.future.push({doc:this.doc,selection:clone(this.selection),label:item.label});this.doc=item.doc;this.selection=item.selection;this.revision++;this.notify('undo');return true}
 redo(){if(this.busy||!this.future.length)return false;const item=this.future.pop();this.history.push({doc:this.doc,selection:clone(this.selection),label:item.label});this.doc=item.doc;this.selection=item.selection;this.revision++;this.notify('redo');return true}
 serialize(){return serialize(this.doc)}
 dispose(){this.listeners.clear()}
}
