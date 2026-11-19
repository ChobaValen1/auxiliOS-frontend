const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const index=fs.readFileSync('Index.html','utf8'),css=fs.readFileSync('driver-fit-v1.css','utf8'),sw=fs.readFileSync('sw.js','utf8');

test('la capa de pantalla fija del chofer se carga al final, antes del tema claro',()=>{
  assert.match(index,/driver-fit-v1\.css\?v=[^"]+">\n<link rel="stylesheet" href="\/ui\/theme-light-v1\.css/);
  assert.match(index,/name="viewport" content="[^"]*interactive-widget=resizes-content/);
  assert.match(sw,/'\/driver-fit-v1\.css'/);
});

test('el remito ocupa el alto visible y sólo el paso activo puede desplazarse',()=>{
  assert.match(css,/#remitos-nuevo\.rmv-flow \{[^}]*height: 100dvh !important/);
  assert.match(css,/#remitos-nuevo\.rmv-flow:not\(\[style\*="none"\]\) \{ display: flex !important; \}/);
  assert.match(css,/> \.rem-step-panel\.active \{[^}]*min-height: 0 !important;[^}]*overflow-y: auto !important/);
  assert.match(css,/> \.rem-wizard-footer \{[^}]*position: static !important/);
});

test('el texto legal de Arrastre nunca se oculta',()=>{
  assert.match(css,/\.toggle-row:not\(#row-arrastre\) \.toggle-desc \{ display: none !important; \}/);
});
