/** Readox native PDF writer: embeds the canonical SVG rasterization as a JPEG page.
 * Output is a real PDF. Text is rasterized (not selectable). Browser-only.
 * For press-ready vector PDFs, a dedicated vector PDF pipeline remains necessary.
 */
import {GraphicsDocument, rasterize} from './core.mjs';
const enc = new TextEncoder();
function concat(parts){const total=parts.reduce((n,p)=>n+p.length,0);const result=new Uint8Array(total);let off=0;for(const p of parts){result.set(p,off);off+=p.length;}return result;}
export async function exportPDFNative(source,{dpi=150,quality=.94}={}){
 const doc=source instanceof GraphicsDocument?source:new GraphicsDocument(source);
 const d=doc.snapshot();const w=d.page.width,h=d.page.height;
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Dimensions PDF invalides');
 const scale=dpi/72;
 const jpeg= new Uint8Array(await (await rasterize(doc,{format:'jpeg',scale,quality})).arrayBuffer());
 const pw=w.toFixed(3),ph=h.toFixed(3);
 // PDF page uses the same raster pixel dimensions at the requested resolution.
 const stream=enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`);
 const objects=[null,
  [enc.encode('<< /Type /Catalog /Pages 2 0 R >>')],
  [enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')],
  [enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)],
  [enc.encode(`<< /Type /XObject /Subtype /Image /Width ${Math.round(w*scale)} /Height ${Math.round(h*scale)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,enc.encode('\nendstream')],
  [enc.encode(`<< /Length ${stream.length} >>\nstream\n`),stream,enc.encode('\nendstream')]
 ];
 const parts=[enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];const offsets=[0];let pos=parts[0].length;
 for(let i=1;i<objects.length;i++){
  offsets.push(pos);const a=enc.encode(`${i} 0 obj\n`),b=enc.encode('\nendobj\n');parts.push(a,...objects[i],b);pos+=a.length+objects[i].reduce((n,x)=>n+x.length,0)+b.length;
 }
 const xrefPos=pos;let xref=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
 for(let i=1;i<objects.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 xref+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
 parts.push(enc.encode(xref));return new Blob(parts,{type:'application/pdf'});
}
