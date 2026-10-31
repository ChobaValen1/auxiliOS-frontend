const test=require('node:test');const assert=require('node:assert');const fs=require('fs');
const html=fs.readFileSync('Index.html','utf8'),js=fs.readFileSync('ui/count-v1.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
test('U11 números que cuentan: se carga, respeta formato y movimiento reducido',()=>{
  assert.match(html,/\/ui\/count-v1\.js\?v=/);assert.match(sw,/'\/ui\/count-v1\.js'/);
  assert.match(js,/kpi-dash-val/);assert.match(js,/prefers-reduced-motion: reduce/);assert.match(js,/es-AR/);assert.match(js,/axCountDone/);
});
