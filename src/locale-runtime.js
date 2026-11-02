import { createI18n } from './i18n.js';
import { TRANSLATIONS } from './translations.js';
import ja from './locales/ja.js';
import { createStaticTranslator } from './i18n-dom.js';
const language=createI18n({catalogs:TRANSLATIONS});
export const { t, getLanguage, setLanguage }=language;
let applyStatic;
export function applyTranslations() {
  applyStatic ??= createStaticTranslator(document,ja,t);
  applyStatic();
  document.documentElement.lang=getLanguage();
}
