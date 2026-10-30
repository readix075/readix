/** Readox Graphics Core v1: headless document model and rendering contract.
 * No UI is created and no existing editor is modified.
 * Fabric.js adapter is optional; install Fabric.js separately to activate its renderer.
 */
const clone = x => JSON.parse(JSON.stringify(x));
const num = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const uid = () => 'rx-' + Math.random().toString(36).slice(2,11);
export class GraphicsDocument {
  constructor(source={}) { this.load(source); this.undoStack=[]; this.redoStack=[]; }
  load(source) {
    const s=clone(source);
    if (!s.page || !Array.isArray(s.items)) throw new TypeError('Document invalide : page/items requis');
    this.data={format:'readox-flyer',version:3,name:String(s.name||'Sans titre'),page:{width:num(s.page.width,510),height:num(s.page.height,660),background:s.page.background||'#ffffff'},items:s.items.map((item,i)=>normalizeItem(item,i)),metadata:s.metadata||{}};
    if(this.data.page.width<=0||this.data.page.height<=0) throw new RangeError('Dimensions de page invalides');
    return this;
  }
  snapshot(){return clone(this.data)}
  transact(fn){const before=this.snapshot();try{fn(this.data);this.undoStack.push(before);this.redoStack=[];}catch(e){this.data=before;throw e;}return this;}
  add(item){let id;this.transact(d=>{const n=normalizeItem({...item,id:item.id||uid()},d.items.length);if(d.items.some(x=>x.id===n.id))throw new Error('ID déjà utilisé');d.items.push(n);id=n.id});return id}
  update(id,patch){this.transact(d=>{const item=d.items.find(x=>x.id===id);if(!item)throw new Error('Objet introuvable');Object.assign(item,clone(patch));Object.assign(item,normalizeItem(item,d.items.indexOf(item)));});return this}
  remove(id){this.transact(d=>{const i=d.items.findIndex(x=>x.id===id);if(i<0)throw new Error('Objet introuvable');d.items.splice(i,1)});return this}
  move(id,index){this.transact(d=>{const i=d.items.findIndex(x=>x.id===id);if(i<0)throw new Error('Objet introuvable');d.items.splice(clamp(index,0,d.items.length),0,d.items.splice(i,1)[0]);});return this}
  undo(){if(!this.undoStack.length)return false;this.redoStack.push(this.snapshot());this.data=this.undoStack.pop();return true}
  redo(){if(!this.redoStack.length)return false;this.undoStack.push(this.snapshot());this.data=this.redoStack.pop();return true}
  get(id){return clone(this.data.items.find(x=>x.id===id)||null)}
  serialize(){return JSON.stringify(this.data)}
  static deserialize(json){return new GraphicsDocument(typeof json==='string'?JSON.parse(json):json)}
}
function normalizeItem(o,i){
 const type=o.type==='rectangle'?'rect':o.type;
 if(!['rect','text','image','ellipse','line'].includes(type))throw new TypeError('Type objet non pris en charge: '+type);
 return {...o,id:String(o.id||`item-${i}`),type,x:num(o.x),y:num(o.y),w:Math.max(0,num(o.w)),h:Math.max(0,num(o.h)),rotation:num(o.rotation),opacity:clamp(num(o.opacity,100),0,100),visible:o.visible!==false,locked:o.locked===true};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const attr=(key,v)=>` ${key}="${esc(v)}"`;
export function toSVG(doc,{imageHref}={}){
 const d=doc instanceof GraphicsDocument?doc.snapshot():new GraphicsDocument(doc).snapshot();
 const {width:w,height:h,background:bg}=d.page;
 const out=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,`<rect width="${w}" height="${h}" fill="${esc(bg)}"/>`];
 for(const o of d.items){if(!o.visible)continue;
  const tr=o.rotation?` transform="rotate(${o.rotation} ${o.x+o.w/2} ${o.y+o.h/2})"`:'';
  const common=` opacity="${o.opacity/100}"${tr}`;
  if(o.type==='rect')out.push(`<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${num(o.radius)}" fill="${esc(o.bg||o.color||'#000')}"${common}/>`);
  if(o.type==='ellipse')out.push(`<ellipse cx="${o.x+o.w/2}" cy="${o.y+o.h/2}" rx="${o.w/2}" ry="${o.h/2}" fill="${esc(o.bg||o.color||'#000')}"${common}/>`);
  if(o.type==='line')out.push(`<line x1="${o.x}" y1="${o.y}" x2="${o.x+o.w}" y2="${o.y+o.h}" stroke="${esc(o.color||'#000')}" stroke-width="${num(o.strokeWidth,2)}"${common}/>`);
  if(o.type==='image'){const src=imageHref?imageHref(o):o.src;if(src)out.push(`<image x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" preserveAspectRatio="${esc(o.fit==='contain'?'xMidYMid meet':'xMidYMid slice')}" href="${esc(src)}"${common}/>`);}
  if(o.type==='text'){
   const size=num(o.size,24),lineHeight=num(o.lineHeight,1.2),lines=String(o.text||'').split('\n');
   const anchor=o.align==='center'?'middle':o.align==='right'?'end':'start';const x=o.x+(anchor==='middle'?o.w/2:anchor==='end'?o.w:0);
   const font=` font-family="${esc(o.fontFamily||'Arial, sans-serif')}" font-size="${size}" font-weight="${esc(o.bold?'700':o.fontWeight||'400')}" font-style="${o.italic?'italic':'normal'}" text-anchor="${anchor}"`;
   out.push(`<g${common}><svg x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" overflow="hidden"><text x="${x-o.x}" y="${size}" fill="${esc(o.color||'#000')}"${font}>`);
   lines.forEach((line,i)=>out.push(`<tspan x="${x-o.x}" dy="${i?size*lineHeight:0}">${esc(line)}</tspan>`));
   out.push('</text></svg></g>');
  }
 }
 out.push('</svg>');return out.join('');
}
export function svgBlob(doc,opts){return new Blob([toSVG(doc,opts)],{type:'image/svg+xml;charset=utf-8'})}
export async function rasterize(doc,{format='png',scale=1,quality=.92,imageHref}={}){
 if(!['png','jpeg','jpg'].includes(format))throw new Error('Format raster invalide');
 if(typeof document==='undefined')throw new Error('Rasterisation requiert un navigateur');
 const d=doc instanceof GraphicsDocument?doc.snapshot():new GraphicsDocument(doc).snapshot();
 const svg=svgBlob(d,{imageHref}),url=URL.createObjectURL(svg);
 try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Chargement SVG impossible (ressources externes/CORS ?)'));img.src=url});const canvas=document.createElement('canvas');canvas.width=Math.round(d.page.width*scale);canvas.height=Math.round(d.page.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Export canvas impossible')),format==='png'?'image/png':'image/jpeg',quality));}finally{URL.revokeObjectURL(url)}
}
/** A host-provided PDF converter is required; no fake PDF output. */
export async function exportPDF(doc,converter){if(typeof converter!=='function')throw new Error('Convertisseur PDF requis');return converter({svg:toSVG(doc),page:(doc instanceof GraphicsDocument?doc.snapshot():doc).page})}
