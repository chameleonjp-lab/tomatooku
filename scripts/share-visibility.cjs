// Serialized by Playwright into the real page; also exercised with geometry fixtures.
function inspectShareTarget(el) {
  const doc=el.ownerDocument, win=doc.defaultView, r=el.getBoundingClientRect();
  let visible=true, unclipped=true;
  const within=(start,end,min,max)=>start>=min-.5&&end<=max+.5;
  const viewport=within(r.left,r.right,0,win.innerWidth)&&within(r.top,r.bottom,0,win.innerHeight);
  for(let p=el;p;p=p.parentElement){
    const s=win.getComputedStyle(p);
    if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)visible=false;
    if(p===el)continue;
    const a=p.getBoundingClientRect(), root=p===doc.scrollingElement;
    const left=root?0:a.left+p.clientLeft, top=root?0:a.top+p.clientTop;
    const right=root?win.innerWidth:left+p.clientWidth, bottom=root?win.innerHeight:top+p.clientHeight;
    if(/^(hidden|clip|scroll|auto)$/.test(s.overflowX)&&!within(r.left,r.right,left,right))unclipped=false;
    if(/^(hidden|clip|scroll|auto)$/.test(s.overflowY)&&!within(r.top,r.bottom,top,bottom))unclipped=false;
  }
  const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
  return {width:r.width,height:r.height,visible,viewport,unclipped,hit:el.contains(doc.elementFromPoint(x,y)),fits:el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1};
}

module.exports={inspectShareTarget};
