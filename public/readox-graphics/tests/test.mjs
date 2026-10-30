import assert from 'node:assert/strict';
import {GraphicsDocument,toSVG} from '../core.mjs';
import {readFileSync} from 'node:fs';
const reg=JSON.parse(readFileSync(new URL('../../flyer-models/registry.json',import.meta.url)));
assert.equal(reg.categories.length,8);assert.equal(reg.models.length,0);
const doc=new GraphicsDocument({page:{width:510,height:660,background:'#fff'},items:[]});
doc.add({type:'rect',x:10,y:10,w:50,h:40,color:'#000'});assert.match(toSVG(doc),/rect/);
console.log('OK: 8 catégories, 0 modèles, document vierge et SVG');
