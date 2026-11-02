import test from 'node:test';
import assert from 'node:assert/strict';
import helpers from './share-visibility.cjs';
const {inspectShareTarget}=helpers;
function fixture({target={},parent={},root={},styles={}}={}){
 const rect=v=>({left:0,top:0,right:393,bottom:852,width:393,height:852,...v});
 const doc={};const win={innerWidth:393,innerHeight:852,getComputedStyle:n=>({display:'block',visibility:'visible',opacity:'1',overflowX:'visible',overflowY:'visible',...n.style})};doc.defaultView=win;
 const ancestor=(geometry,style,parentElement)=>({ownerDocument:doc,parentElement,style,clientLeft:0,clientTop:0,clientWidth:geometry.width,clientHeight:geometry.height,getBoundingClientRect:()=>geometry});
 const html=ancestor(rect(root),{overflowX:'hidden',overflowY:'auto'},null);doc.scrollingElement=html;
 const box=ancestor(rect(parent),styles,html);
 const geometry=rect({left:20,top:20,right:180,bottom:68,width:160,height:48,...target});
 const el=ancestor(geometry,{},box);el.scrollWidth=el.clientWidth;el.scrollHeight=el.clientHeight;el.contains=n=>n===el;doc.elementFromPoint=()=>el;
 return{el,box,html,doc};
}
const accepted=el=>{const a=inspectShareTarget(el);return a.visible&&a.viewport!==false&&a.unclipped!==false&&a.hit&&a.fits&&a.width>=44&&a.height>=44};
test('normal fully visible target accepted',()=>assert.equal(accepted(fixture().el),true));
test('transparent or display-none ancestor cannot pass even with a center hit',()=>{for(const styles of [{opacity:'0'},{display:'none'},{visibility:'hidden'}])assert.equal(accepted(fixture({styles}).el),false)});
test('8px ancestor clipping is rejected although center remains reachable',()=>assert.equal(accepted(fixture({parent:{top:28,bottom:852,height:824},styles:{overflowY:'hidden'}}).el),false));
test('fixed target partially outside viewport is rejected despite a mocked center hit',()=>assert.equal(accepted(fixture({target:{top:-8,bottom:40,height:48}}).el),false));
test('scrolling root uses viewport origin rather than scrolled document rect',()=>assert.equal(accepted(fixture({root:{top:-300,bottom:552,height:852},target:{top:780,bottom:828,height:48}}).el),true));
test('non-root clipping uses client border origin',()=>{const f=fixture({parent:{top:20,bottom:100,height:80},styles:{overflowY:'auto'}});f.box.clientTop=9;assert.equal(accepted(f.el),false)});

