// Language IDs/locales follow sainome@79b1e5733e725cd1148b10fa5699ba846e2bf57d.
// This module owns display preferences only, never game/session/network state.
export const LANGUAGE_STORAGE_KEY = 'tomatoku.language.v1';
export const SUPPORTED_LANGUAGES = Object.freeze([
  {id:'ja',name:'日本語',locale:'ja-JP'}, {id:'en',name:'English',locale:'en-US'},
  {id:'es',name:'Español',locale:'es-ES'}, {id:'pt-BR',name:'Português (Brasil)',locale:'pt-BR'},
  {id:'zh-Hans',name:'简体中文',locale:'zh-CN'}, {id:'fr',name:'Français',locale:'fr-FR'},
  {id:'de',name:'Deutsch',locale:'de-DE'}, {id:'ko',name:'한국어',locale:'ko-KR'},
  {id:'ru',name:'Русский',locale:'ru-RU'}, {id:'it',name:'Italiano',locale:'it-IT'},
  {id:'zh-Hant',name:'繁體中文',locale:'zh-TW'}, {id:'id',name:'Bahasa Indonesia',locale:'id-ID'},
  {id:'tr',name:'Türkçe',locale:'tr-TR'}, {id:'vi',name:'Tiếng Việt',locale:'vi-VN'},
  {id:'th',name:'ไทย',locale:'th-TH'}
].map(Object.freeze));
export function isSupportedLanguage(id) { return SUPPORTED_LANGUAGES.some(l=>l.id===id); }
export function getLanguageLocale(id) { return SUPPORTED_LANGUAGES.find(l=>l.id===id)?.locale ?? 'en-US'; }
export function languageFromLocale(locale) {
  if (typeof locale !== 'string') return null;
  const parts=locale.trim().toLowerCase().replaceAll('_','-').split('-');
  if (parts[0]==='zh') {
    if (parts.includes('hant')) return 'zh-Hant';
    if (parts.includes('hans')) return 'zh-Hans';
    return parts.some(p=>['tw','hk','mo'].includes(p)) ? 'zh-Hant' : 'zh-Hans';
  }
  if (parts[0]==='pt') return 'pt-BR';
  return isSupportedLanguage(parts[0]) ? parts[0] : null;
}
function safeStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function createI18n({storage=safeStorage(),navigatorObject=globalThis.navigator,catalogs={}}={}) {
  const candidates=[...(Array.isArray(navigatorObject?.languages)?navigatorObject.languages:[]),navigatorObject?.language];
  let language=candidates.map(languageFromLocale).find(Boolean) ?? 'en';
  try { const saved=storage?.getItem(LANGUAGE_STORAGE_KEY); if(isSupportedLanguage(saved)) language=saved; } catch {}
  return Object.freeze({
    getLanguage:()=>language,
    setLanguage(next) {
      if(!isSupportedLanguage(next)) return;
      language=next;
      try { storage?.setItem(LANGUAGE_STORAGE_KEY,language); } catch {}
    },
    t(key,parameters={}) {
      const catalog=catalogs[language];
      if (!catalog || !Object.hasOwn(catalog,key) || typeof catalog[key]!=='string') throw new Error('Missing translation: '+language+':'+key);
      return catalog[key].replace(/\{([a-zA-Z0-9_]+)\}/g,(placeholder,name)=>Object.hasOwn(parameters,name)?String(parameters[name]):placeholder);
    }
  });
}
