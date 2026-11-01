/** Readox GF-01 — primitives vectorielles, typographie, masques, géométrie.
 * Moteur autonome sans UI; compatible Fabric 6 et documents Readox.
 */
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const GF01_TYPES=Object.freeze(['path','svg','icon','symbol','customShape','text','textbox','richText','textOnPath','group','layerGroup','maskGroup','clipFrame','imageFrame','polygon','star','roundedRect']);
export function validateGeometry(o){const errors=[];for(const k of ['x','y','w','h'])if(!Number.isFinite(Number(o[k])))errors.push(`invalid ${k}`);if(finite(o.w)<=0||finite(o.h)<=0)errors.push('nonpositive bounds');if(o.path&&(!/^[\sMmLlHhVvCcSsQqTtAaZz0-9.,+\-eE]+$/.test(o.path)||o.path.length>50000))errors.push('unsafe path');return errors;}
export function fitText({text='',fontSize=24,fontFamily='Arial',fontWeight='normal',width,height,minFontSize=8,lineHeight=1.18,measure}){
 const content=String(text);const lines=content.split(/\r?\n/);const m=measure||((s,size)=>s.length*size*.58);
 let size=finite(fontSize,24);const min=finite(minFontSize,8);let widthNeeded=0,heightNeeded=0;
 while(size>=min){widthNeeded=Math.max(0,...lines.map(line=>m(line,size,fontFamily,fontWeight)));heightNeeded=lines.length*size*lineHeight;if(widthNeeded<=width&&heightNeeded<=height)break;size-=.5;}
 return {fontSize:Math.max(min,size),fits:widthNeeded<=width&&heightNeeded<=height,measuredWidth:widthNeeded,measuredHeight:heightNeeded,lines:lines.length};
}
export function boundsReport(doc){const W=finite(doc.page?.width),H=finite(doc.page?.height);return (doc.items||[]).flatMap(o=>{const issues=validateGeometry(o);if(finite(o.x)<0||finite(o.y)<0||finite(o.x)+finite(o.w)>W||finite(o.y)+finite(o.h)>H)issues.push('outside page');return issues.length?[{id:o.id,issues}]:[];});}
export function makeClipPath(fabric,clip){if(!clip)return null;const w=finite(clip.w,100),h=finite(clip.h,100);const common={left:0,top:0,originX:'left',originY:'top',absolutePositioned:false};if(clip.path&&fabric.Path)return new fabric.Path(clip.path,{...common,scaleX:1,scaleY:1});if(clip.type==='ellipse')return new fabric.Ellipse({...common,rx:w/2,ry:h/2});return new fabric.Rect({...common,width:w,height:h,rx:finite(clip.radius),ry:finite(clip.radius)});}
export function applyAppearance(fabric,obj,o){if(!obj)return obj;
 const patch={};if(o.stroke)patch.stroke=o.stroke;if(o.strokeWidth!=null)patch.strokeWidth=finite(o.strokeWidth);if(o.strokeDashArray)patch.strokeDashArray=o.strokeDashArray;if(o.flipX!=null)patch.flipX=!!o.flipX;if(o.flipY!=null)patch.flipY=!!o.flipY;if(o.skewX!=null)patch.skewX=finite(o.skewX);if(o.skewY!=null)patch.skewY=finite(o.skewY);
 if(o.shadow&&fabric.Shadow){const s=o.shadow;patch.shadow=new fabric.Shadow({color:s.color||'#00000055',blur:clamp(finite(s.blur),0,200),offsetX:finite(s.offsetX),offsetY:finite(s.offsetY)});}
 if(o.clipPath)patch.clipPath=makeClipPath(fabric,o.clipPath);
 if(o.gradient&&fabric.Gradient){const g=o.gradient;patch.fill=new fabric.Gradient({type:g.type==='radial'?'radial':'linear',coords:g.coords||{x1:0,y1:0,x2:finite(o.w,100),y2:0},colorStops:(g.stops||[]).map(s=>({offset:clamp(finite(s.offset),0,1),color:s.color}))});}
 obj.set(patch);return obj;
}
export function makeText(fabric,o,p){const opts={...p,fontFamily:o.fontFamily||o.font||'Arial',fontSize:finite(o.size,24),fontWeight:o.bold?'bold':o.fontWeight||'normal',fontStyle:o.italic?'italic':'normal',fill:o.color||'#222',textAlign:o.align||'left',lineHeight:finite(o.lineHeight,1.18),charSpacing:finite(o.charSpacing)||(finite(o.letterSpacing)?Math.round(finite(o.letterSpacing)/Math.max(1,finite(o.size,24))*1000):0),underline:!!o.underline,linethrough:!!o.linethrough};
 if(o.autoFit){const measure=(line,size,family,weight)=>{const canvas=typeof document!=='undefined'?document.createElement('canvas'):null;if(!canvas)return line.length*size*.58;const ctx=canvas.getContext('2d');ctx.font=`${weight} ${size}px ${family}`;return ctx.measureText(line).width;};opts.fontSize=fitText({text:o.text,fontSize:opts.fontSize,fontFamily:opts.fontFamily,fontWeight:opts.fontWeight,width:p.width,height:p.height,minFontSize:o.minFontSize||8,lineHeight:opts.lineHeight,measure}).fontSize;}
 if(o.type==='textOnPath'&&o.path&&fabric.Path&&fabric.Text){const path=new fabric.Path(o.path,{visible:false});return new fabric.Text(o.text||'',{...opts,path,pathSide:o.pathSide||'left',pathAlign:o.pathAlign||'baseline'});}
 const C=fabric.Textbox||fabric.IText;return new C(o.text||'',opts);
}
const __fontDataCache=new Map();
async function cacheFontData(f){try{const res=await fetch(f.src);if(!res.ok)return;const bytes=new Uint8Array(await res.arrayBuffer());let bin='';for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));__fontDataCache.set(f.family+'|'+(f.weight||'normal')+'|'+(f.style||'normal')+'|'+f.src,{dataUri:'data:font/woff2;base64,'+btoa(bin),unicodeRange:f.unicodeRange||''});}catch{}}
const __loadFontsDone=new Set();
export async function loadFonts(fonts=[]){if(typeof document==='undefined'||!document.fonts)return {loaded:[],failed:fonts.map(f=>f.family)};const loaded=[],failed=[];for(const f of fonts){try{if(!f.family||!f.src)throw Error('font source missing');const key=f.family.replace(/^["']|["']$/g,'')+'|'+(f.weight||'400')+'|'+(f.style||'normal')+'|'+f.src;if(__loadFontsDone.has(key)){loaded.push(f.family);continue;}const ff=new FontFace(f.family,`url("${f.src}")`,{weight:f.weight||'normal',style:f.style||'normal',...(f.unicodeRange?{unicodeRange:f.unicodeRange}:{})});await ff.load();document.fonts.add(ff);__loadFontsDone.add(key);await cacheFontData(f);loaded.push(f.family);}catch{failed.push(f.family);}}return {loaded,failed};}
// Style @font-face embarqué (data URI) pour les exports SVG/PNG/JPG autonomes : ne couvre que les familles réellement utilisées par le document.
if(typeof window!=='undefined')window.__readoxSvgFontsStyle=function(items){
 if(!__fontDataCache.size)return'';
 const used=new Set();const walk=a=>(a||[]).forEach(it=>{if(it&&typeof it.font==='string'){const fam=it.font.split(',')[0].trim().replace(/^["']|["']$/g,'');if(fam)used.add(fam);}if(it&&it.children)walk(it.children);});walk(items);
 let css='';for(const [key,v] of __fontDataCache){const [family,weight,style]=key.split('|');if(!used.has(family))continue;css+='@font-face{font-family:"'+family+'";font-weight:'+weight+';font-style:'+style+';src:url("'+v.dataUri+'") format("woff2");'+(v.unicodeRange?'unicode-range:'+v.unicodeRange+';':'')+'}';}
 return css?'<style>'+css+'</style>':'';
};
