/** RIPE v0.1 — shared canonical manuscript contract; no UI or provider dependency. */
import {randomUUID} from 'node:crypto';
const safe=(s,n=120000)=>String(s??'').slice(0,n);
const kinds=new Set(['paragraph','heading','image','caption','quote','list']);
export function newManuscript({title='',language='fr',brief='',chapters=[]}={}){
  const book={schema:'readox.manuscript.v1',id:randomUUID(),title:safe(title,250),language:safe(language,12),brief:safe(brief,12000),revision:0,chapters:[],assets:[],createdAt:new Date().toISOString()};
  for(const c of chapters)book.chapters.push({id:randomUUID(),title:safe(c.title,250),blocks:[],status:'planned'});
  return book;
}
export function appendChapterBlocks(book,chapterId,blocks){
  if(book?.schema!=='readox.manuscript.v1')throw Error('Schéma manuscrit invalide');
  const chapter=book.chapters.find(c=>c.id===chapterId);if(!chapter)throw Error('Chapitre inconnu');
  if(!Array.isArray(blocks)||blocks.length>1000)throw Error('Liste de blocs invalide');
  const incoming=blocks.map(b=>{
    if(!kinds.has(b?.type))throw Error('Type de bloc inconnu');
    if(b.type==='image'&&!b.assetId)throw Error('Image sans assetId');
    return {id:randomUUID(),type:b.type,text:safe(b.text),...(b.assetId?{assetId:safe(b.assetId,200)}:{}),...(b.alt?{alt:safe(b.alt,500)}:{})};
  });
  chapter.blocks.push(...incoming);chapter.status='draft';book.revision++;return book;
}
export function addAsset(book,{id=randomUUID(),mimeType,uri,alt='',status='ready'}){
  if(book?.schema!=='readox.manuscript.v1')throw Error('Schéma manuscrit invalide');
  if(!/^image\/(png|jpeg|webp)$/.test(mimeType)||!uri)throw Error('Ressource image invalide');
  if(book.assets.some(a=>a.id===id))throw Error('Identifiant ressource déjà présent');
  book.assets.push({id,mimeType,uri,alt:safe(alt,500),status});book.revision++;return id;
}
export function auditManuscript(book){
  if(book?.schema!=='readox.manuscript.v1')throw Error('Schéma manuscrit invalide');
  const assetIds=new Set(book.assets.map(a=>a.id));const missing=[];let blocks=0,characters=0;
  for(const c of book.chapters){for(const b of c.blocks){blocks++;characters+=b.text?.length||0;if(b.type==='image'&&!assetIds.has(b.assetId))missing.push({chapterId:c.id,blockId:b.id,assetId:b.assetId});}}
  return {chapters:book.chapters.length,blocks,characters,missingImages:missing,complete:missing.length===0};
}
export function parseStructuredJson(text){
  const s=String(text||'').trim().replace(/^```(?:json)?\s*|\s*```$/g,'');return JSON.parse(s);
}
export function validatePlan(raw){
  if(!raw||typeof raw.title!=='string'||!Array.isArray(raw.chapters)||raw.chapters.length<1||raw.chapters.length>30)throw Error('Plan invalide');
  const chapters=raw.chapters.map(c=>{if(typeof c.title!=='string'||!c.title.trim())throw Error('Titre de chapitre manquant');return {title:c.title.slice(0,250),summary:safe(c.summary,1200)};});
  return {title:raw.title.slice(0,250),chapters};
}
