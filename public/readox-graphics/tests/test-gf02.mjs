import assert from 'node:assert/strict';
import {imagePlacement,normalizeImageSpec,auditAssets} from '../gf02.mjs';
assert.equal(imagePlacement(1000,500,100,100,{fit:'cover'}).drawWidth,200);
assert.equal(imagePlacement(1000,500,100,100,{fit:'contain'}).drawWidth,100);
assert.equal(normalizeImageSpec({crop:{x:0.1,y:0.2,w:0.6,h:0.7}}).crop.w,0.6);
assert.equal(auditAssets({items:[{id:'a',type:'image',w:20,h:20}]}).length,1);
console.log('GF-02 image geometry tests passed');
