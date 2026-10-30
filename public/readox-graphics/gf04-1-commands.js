/** GF-04.1: commande unique aperçu/export basée sur la scène du document. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const wait=async()=>{if(window.__readoxGF04)return window.__readoxGF04;await new Promise((resolve,reject)=>{let timeout=setTimeout(()=>reject(Error('GF-04 indisponible')),10000);document.addEventListener('readox:gf04:ready',()=>{clearTimeout(timeout);resolve();},{once:true});});return window.__readoxGF04;};
 const scene=()=>{if(window.__readoxGF05C)return window.__readoxGF05C.snapshot();const api=window.__readoxFlyerPhase8;if(!api?.capture)throw Error('Document non initialisé');return api.capture();};
 const dataBytes=async data=>new Uint8Array(await(await fetch(data)).arrayBuffer());
 function pdfJPEG(bytes,width,height,pixelsW,pixelsH){
  const enc=new TextEncoder(),parts=[],offsets=[0];let len=0;
  const add=v=>{const b=typeof v==='string'?enc.encode(v):v;parts.push(b);len+=b.length;};
  const obj=(n,v)=>{offsets[n]=len;add(n+' 0 obj\n');add(v);add('\nendobj\n');};
  add('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4]=len;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelsW} /Height ${pixelsH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);add(bytes);add('\nendstream\nendobj\n');
  const content=`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\n`;obj(5,`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);
  const xref=len;add('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'});
 }
 function save(blob,ext){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='readox-flyer.'+ext;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function output(fmt){const engine=await wait(),doc=scene();if(fmt==='pdf'){
   const result=await engine.render(doc,'jpeg',6);const b=await dataBytes(result.data);const p=result.scene.page;save(pdfJPEG(b,p.width,p.height,Math.round(p.width*6),Math.round(p.height*6)),'pdf');return;
  }await engine.download(doc,fmt==='jpg'?'jpeg':fmt,'readox-flyer');}
 function dialog(){let el=$('gf041-dialog');if(el)return el;el=document.createElement('div');el.id='gf041-dialog';el.hidden=true;el.style.cssText='position:fixed;inset:0;background:#061527cc;z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px';
 el.innerHTML='<section role="dialog" aria-modal="true" aria-label="Export graphique" style="background:#fff;color:#14233b;border-radius:16px;padding:22px;max-width:390px;width:100%"><h2>Exporter le document</h2><p>Rendu issu de la scène graphique Fabric.js.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button data-format="png">PNG</button><button data-format="jpg">JPG</button><button data-format="pdf">PDF</button><button data-close>Annuler</button></div><p id="gf041-error" role="alert"></p></section>';
 const style=document.createElement('style');style.textContent='#gf041-dialog[hidden]{display:none!important}#gf041-dialog button{padding:11px;border-radius:8px;border:1px solid #aec1d8;background:#edf4ff;color:#102442;cursor:pointer}';document.head.append(style);document.body.append(el);
 el.addEventListener('click',async e=>{if(e.target===el||e.target.closest('[data-close]')){el.hidden=true;return;}const b=e.target.closest('[data-format]');if(!b)return;const err=$('gf041-error');err.textContent='Génération en cours…';b.disabled=true;try{await output(b.dataset.format);el.hidden=true;}catch(ex){err.textContent='Export impossible : '+ex.message;}finally{b.disabled=false;}});return el;}
 async function preview(){const engine=await wait(),doc=scene();const out=await engine.render(doc,'png',1.5);let overlay=$('gf041-preview');if(!overlay){overlay=document.createElement('div');overlay.id='gf041-preview';overlay.style.cssText='position:fixed;inset:0;background:#071427ed;z-index:999998;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:12px';overlay.innerHTML='<button type="button" style="padding:10px 18px;cursor:pointer">Fermer l’aperçu</button><img alt="Aperçu du document" style="max-width:95vw;max-height:85vh;object-fit:contain">';overlay.querySelector('button').onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};document.body.append(overlay);}overlay.querySelector('img').src=out.data;}
 function init(){const exp=$('export'),prev=$('preview');if(exp)exp.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();dialog().hidden=false;},true);
 if(prev)prev.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();try{await preview();}catch(err){alert('Aperçu Fabric.js impossible : '+err.message);}},true);
 window.__readoxGF041={version:'GF-04.1',output,preview,pdfJPEG};}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();