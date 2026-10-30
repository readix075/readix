/** GF-04: one structured scene -> Fabric renderer for previews and export.
 * Independent of editor UI; no mutations of the source document.
 * Fabric SDK is loaded by GF-01.1; this module reuses that instance when available.
 */
import {createFabricCanvas} from './fabric-adapter.mjs';
const sdkUrls=['https://cdn.jsdelivr.net/npm/fabric@6.7.1/+esm','https://esm.sh/fabric@6.7.1?bundle'];
let sdkPromise;
async function sdk(){
 if(window.fabric?.Canvas)return window.fabric;
 if(!sdkPromise)sdkPromise=(async()=>{let last;for(const url of sdkUrls){try{const mod=await import(/* @vite-ignore */url);const f=mod.fabric?.Canvas?mod.fabric:mod;if(f?.Canvas&&f?.Rect)return f;}catch(e){last=e;}}throw new Error('Fabric SDK indisponible : '+(last?.message||'chargement impossible'));})();
 return sdkPromise;
}
function normalize(raw){
 const p=raw?.page||{};const items=raw?.items||[];
 return {format:'readox-flyer',version:raw?.version||3,metadata:raw?.metadata||{},page:{width:Number(p.width)||510,height:Number(p.height)||660,background:p.background||raw?.pageBg||'#ffffff'},items:JSON.parse(JSON.stringify(items))};
}
const toBlob=async(data)=>{const r=await fetch(data);if(!r.ok)throw Error('Conversion impossible');return r.blob();};
async function render(raw,format='png',scale=1){
 const source=raw?.format==='readox-graphic-document'?(await import('./gf05a/document-fabric-adapter.mjs')).toFabricSource(raw):{document:raw,warnings:[]};if(source.warnings.length)throw Error('Export fidèle impossible : '+source.warnings.map(w=>w.code).join(','));const scene=normalize(source.document);const fabric=await sdk();const el=document.createElement('canvas');
 const instance=await createFabricCanvas(fabric,el,scene,{interactive:false});
 try{
  if(document.fonts?.ready)await document.fonts.ready;
  const s=Math.max(.1,Math.min(8,Number(scale)||1));
  if(format==='svg')return {data:instance.toSVG(),mime:'image/svg+xml',scene};
  if(format!=='png'&&format!=='jpeg')throw Error('Format non pris en charge: '+format);
  const data=format==='jpeg'?instance.toJPG(s):instance.toPNG(s);
  return {data,mime:format==='jpeg'?'image/jpeg':'image/png',scene};
 }finally{await instance.destroy();}
}
async function thumbnail(raw,img){
 const out=await render(raw,'png',Math.min(1,360/(Number(raw?.page?.width||raw?.pages?.[0]?.width)||510)));
 img.src=out.data;img.dataset.gf04='fabric';return img;
}
async function download(raw,format='png',filename='readox-flyer'){
 const out=await render(raw,format,format==='svg'?1:3);
 const blob=format==='svg'?new Blob([out.data],{type:out.mime}):await toBlob(out.data);
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename+'.'+(format==='jpeg'?'jpg':format);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
 return {mime:out.mime,size:blob.size};
}
window.__readoxGF04={version:'GF-04',render,thumbnail,download,normalize,available:async()=>{try{await sdk();return true;}catch{return false;}}};
document.dispatchEvent(new CustomEvent('readox:gf04:ready'));
