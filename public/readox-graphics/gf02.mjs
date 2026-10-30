/** GF-02 — image asset and non-destructive image layout utilities. No DOM/UI dependency. */
export const IMAGE_FIT = Object.freeze(['cover','contain','fill']);
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
export function normalizeImageSpec(item={}) {
 const crop=item.crop&&typeof item.crop==='object'?item.crop:{};
 const fit=IMAGE_FIT.includes(item.fit)?item.fit:'cover';
 return {src:String(item.src||''),fit,crop:{x:Math.max(0,Math.min(1,finite(crop.x))),y:Math.max(0,Math.min(1,finite(crop.y))),w:Math.max(.001,Math.min(1,finite(crop.w,1))),h:Math.max(.001,Math.min(1,finite(crop.h,1)))},flipX:!!item.flipX,flipY:!!item.flipY,filters:Array.isArray(item.filters)?item.filters:[],cornerRadius:Math.max(0,finite(item.cornerRadius,item.radius||0)),assetId:item.assetId||null};
}
export function imagePlacement(imageWidth,imageHeight,frameWidth,frameHeight,spec={}) {
 const s=normalizeImageSpec(spec),iw=Math.max(1,finite(imageWidth,1)),ih=Math.max(1,finite(imageHeight,1)),fw=Math.max(1,finite(frameWidth,1)),fh=Math.max(1,finite(frameHeight,1));
 const x=Math.min(s.crop.x,1-s.crop.w)*iw,y=Math.min(s.crop.y,1-s.crop.h)*ih,cw=s.crop.w*iw,ch=s.crop.h*ih;
 const ratio=s.fit==='contain'?Math.min(fw/cw,fh/ch):s.fit==='fill'?null:Math.max(fw/cw,fh/ch);
 const dw=ratio===null?fw:cw*ratio,dh=ratio===null?fh:ch*ratio;
 return {cropX:x,cropY:y,cropWidth:cw,cropHeight:ch,drawWidth:dw,drawHeight:dh,offsetX:(fw-dw)/2,offsetY:(fh-dh)/2,frameWidth:fw,frameHeight:fh,fit:s.fit};
}
export function auditAssets(document,availablePaths=[]) {
 const items=document?.items||[],allow=new Set(availablePaths),issues=[];
 for(const o of items){if(!['image','imageFrame','backgroundImage','patternImage','imageBackground'].includes(o.type))continue;
 if(!o.src)issues.push({id:o.id,code:'MISSING_SOURCE'});
 else if(o.src.startsWith('data:'))issues.push({id:o.id,code:'EMBEDDED_DATA',message:'Prefer an independent asset'});
 else if(o.src.startsWith('/')&&allow.size&&!allow.has(o.src))issues.push({id:o.id,code:'UNRESOLVED_ASSET',src:o.src});
 if(o.w<=0||o.h<=0)issues.push({id:o.id,code:'INVALID_FRAME'});
 if(o.crop){const c=normalizeImageSpec(o).crop;if(c.x+c.w>1.00001||c.y+c.h>1.00001)issues.push({id:o.id,code:'CROP_OUTSIDE_IMAGE'});}
 }
 return issues;
}
export function getImageSource(item,assetRegistry={}) {const asset=item.assetId&&assetRegistry[item.assetId];return asset?.src||item.src||'';}
