const test=require('node:test');const assert=require('node:assert');const fs=require('fs');
const html=fs.readFileSync('Index.html','utf8'),js=fs.readFileSync('ui/sort-flip-v1.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
test('U4 filas que se reacomodan al ordenar: se carga y respeta movimiento reducido',()=>{
  assert.match(html,/\/ui\/sort-flip-v1\.js\?v=/);assert.match(sw,/'\/ui\/sort-flip-v1\.js'/);
  assert.match(js,/th\[aria-sort\]/);assert.match(js,/prefers-reduced-motion: reduce/);assert.match(js,/translateY/);
});
