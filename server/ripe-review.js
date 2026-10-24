import {randomUUID} from 'node:crypto';
export function validateReview(body){
 if(!body||body.schema!=='readox.ripe.review.v1'||!body.pdf||!Array.isArray(body.observations))throw Error('Rapport incompatible');
 const p=body.pdf,hash=String(p.sha256||'').toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Empreinte SHA-256 obligatoire');
 if(typeof p.filename!=='string'||!p.filename.trim()||p.filename.length>255||!p.filename.toLowerCase().endsWith('.pdf'))throw Error('Nom PDF invalide');
 if(!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>104857600||!Number.isInteger(p.pages)||p.pages<1||p.pages>3000)throw Error('Métadonnées PDF invalides');
 if(body.observations.length>10000)throw Error('Trop d’observations');
 const observations=body.observations.map(o=>{
  if(!o||!Number.isInteger(o.page)||o.page<1||o.page>p.pages||!['reviewed','issue','resolved'].includes(o.kind)||typeof(o.message??'')!=='string'||(o.message??'').length>500)throw Error('Observation invalide');
  return {page:o.page,kind:o.kind,message:o.message??''};
 });
 const createdAt=String(body.createdAt||'');
 if(!/^\d{4}-\d{2}-\d{2}T/.test(createdAt)||!Number.isFinite(Date.parse(createdAt)))throw Error('Date invalide');
 return {schema:'readox.ripe.review.v1',createdAt,pdf:{filename:p.filename,bytes:p.bytes,pages:p.pages,sha256:hash},observations};
}
export function makeReviewRow(email,report){const r=validateReview(report);return {id:randomUUID(),email,pdf_sha256:r.pdf.sha256,pdf_filename:r.pdf.filename,pdf_bytes:r.pdf.bytes,pdf_pages:r.pdf.pages,report:r};}
export function validHash(s){return typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)}
