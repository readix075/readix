import assert from 'node:assert/strict';
import {GraphicsDocument,toSVG,exportPDF} from '../core.mjs';
import {createKonvaStage} from '../konva-adapter.mjs';
import {readFileSync} from 'node:fs';
for(const name of ['restaurant','promotion','entreprise','sport','voyage','immobilier','evenement','beaute']){
 const data=JSON.parse(readFileSync(new URL(`./models/flyer-${name}-001.json`,import.meta.url)));
 const d=new GraphicsDocument(data);const first=d.snapshot().items[0];const before=d.serialize();d.update(first.id,{x:first.x+3});assert.notEqual(d.serialize(),before);assert(d.undo());assert.equal(d.serialize(),before);assert(d.redo());assert.equal(d.get(first.id).x,first.x+3);
 const svg=toSVG(d);assert(svg.startsWith('<svg'));assert(svg.endsWith('</svg>'));assert(!svg.includes('[object Object]'));
 assert.equal(GraphicsDocument.deserialize(d.serialize()).snapshot().items.length,data.items.length);
 console.log(name, data.items.length, 'objets OK');
}
let failed=false;try{createKonvaStage(null,null,{page:{width:1,height:1},items:[]})}catch(e){failed=/Konva SDK/.test(e.message)}assert(failed);
let pdfFailed=false;try{await exportPDF({page:{width:1,height:1},items:[]})}catch(e){pdfFailed=/Convertisseur PDF/.test(e.message)}assert(pdfFailed);
console.log('Tous les tests de modèle, rendu SVG et erreurs de dépendance ont réussi');
