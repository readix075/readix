import assert from 'node:assert/strict';
import {fitText,boundsReport,validateGeometry,applyAppearance,makeText} from '../gf01.mjs';
const r=fitText({text:'MENU PIZZA + BOISSON',fontSize:30,width:120,height:35,measure:(s,n)=>s.length*n*.5});assert(r.fontSize<30);
assert(validateGeometry({x:0,y:0,w:10,h:20,path:'M 0 0 L 10 10'}).length===0);
assert(validateGeometry({x:0,y:0,w:10,h:20,path:'javascript:alert(1)'}).length>0);
assert(boundsReport({page:{width:510,height:765},items:[{id:'a',x:500,y:20,w:20,h:10}]}).length===1);
class Fake{constructor(...a){this.args=a;this.attrs=a[1]||{}}set(p){Object.assign(this.attrs,p)}}
const fabric={IText:Fake,Textbox:Fake,Text:Fake,Rect:Fake,Ellipse:Fake,Shadow:Fake};
const obj=makeText(fabric,{type:'text',text:'Bella',fontFamily:'Georgia',size:26},{width:120,height:40});assert(obj.attrs.fontFamily==='Georgia');
applyAppearance(fabric,obj,{shadow:{blur:10},stroke:'#fff',strokeWidth:2,clipPath:{type:'ellipse',w:80,h:40}});assert(obj.attrs.shadow&&obj.attrs.clipPath);
console.log('GF01: geometry, text, appearance, clip tests OK');
