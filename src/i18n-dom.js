// Capture only authored static text once. Never scan later player/ranking content.
export function createStaticTranslator(root, sourceCatalog, translate) {
  const texts=[], attributes=[];
  const rich=[...root.querySelectorAll('[data-i18n-rich]')].map(element=>({element,source:element.innerHTML.trim().replace(/\s+/g,' ')}));
  const walker=root.createTreeWalker(root.documentElement,4);
  let node;
  while ((node=walker.nextNode())) {
    if (node.parentElement?.closest('script,style,[data-i18n-rich]')) continue;
    const source=node.textContent.trim().replace(/\s+/g,' ');
    if (Object.hasOwn(sourceCatalog,source)) texts.push({node,source,before:/^\s/.test(node.textContent)?" ":"",after:/\s$/.test(node.textContent)?" ":""});
  }
  for(const element of root.querySelectorAll('[placeholder],[aria-label],[title],meta[content]')) {
    for(const name of ['placeholder','aria-label','title','content']) {
      const source=element.getAttribute(name);
      if(source && Object.hasOwn(sourceCatalog,source)) attributes.push({element,name,source});
    }
  }
  return () => {
    for(const {element,source} of rich) {
      const translated=translate(source);
      if(translated.replace(/<\/?b>/g,'').includes('<')) throw new Error('Unexpected translation markup');
      element.innerHTML=translated;
    }
    for(const {node,source,before,after} of texts) if(node.isConnected) node.textContent=before+translate(source)+after;
    for(const {element,name,source} of attributes) if(element.isConnected) element.setAttribute(name,translate(source));
  };
}

// Dynamic errors retain their authored key, not the previously translated value.
export function createLocalizedMessage(getElement, translate) {
  let key = '';
  const refresh = () => {
    const element = getElement();
    if (element) element.textContent = key ? translate(key) : '';
  };
  return Object.freeze({
    set(next) { key = next; refresh(); },
    refresh,
    getKey: () => key
  });
}
