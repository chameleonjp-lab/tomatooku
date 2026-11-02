import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SUPPORTED_LANGUAGES} from '../src/i18n.js';
assert.ok(fs.existsSync('src/translations.js'),'all-language catalog entrypoint must exist');
const {TRANSLATIONS}=await import('../src/translations.js');
const ja=TRANSLATIONS.ja, keys=Object.keys(ja).sort();
const parameters=text=>[...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m=>m[1]).sort();
for(const {id} of SUPPORTED_LANGUAGES){
 const catalog=TRANSLATIONS[id];
 assert.ok(catalog,'catalog exists: '+id);
 assert.deepEqual(Object.keys(catalog).sort(),keys,'full key coverage: '+id);
 for(const key of keys){
  assert.equal(typeof catalog[key],'string');
  assert.ok(catalog[key].trim(),'nonempty '+id+':'+key);
  assert.deepEqual(parameters(catalog[key]),parameters(ja[key]),'same parameters '+id+':'+key);
  assert.equal(catalog[key].replace(/<\/?b>/g,'').includes('<'),false,'no new markup '+id+':'+key);
 }
}
assert.equal(ja['Xでシェア'],'Xでシェア');
assert.equal(ja['ランキング'],'ランキング');
console.log('✓ All 15 catalogs have complete keys, preserved parameters and restricted markup');
for(const filename of ['src/main.js','src/tutorial.js','src/accessibility.js','src/result-recovery.js']){
 const source=fs.readFileSync(filename,'utf8');
 for(const match of source.matchAll(/\bt\(("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)){
  const quoted=match[1];
  const key=quoted.startsWith('"')?JSON.parse(quoted):quoted.slice(1,-1);
  assert.ok(Object.hasOwn(ja,key),filename+' UI key is catalogued: '+key);
 }
}
console.log('✓ Literal dynamic UI translation keys are all covered');
