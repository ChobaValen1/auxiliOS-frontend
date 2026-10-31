const test=require('node:test');const assert=require('node:assert');const fs=require('fs');
const html=fs.readFileSync('Index.html','utf8'),js=fs.readFileSync('ui/scroll-fab-v1.js','utf8'),css=fs.readFileSync('ui/scroll-fab-v1.css','utf8'),sw=fs.readFileSync('sw.js','utf8');
test('U8 botón flotante: se carga, se achica al bajar y respeta movimiento reducido',()=>{
  assert.match(html,/\/ui\/scroll-fab-v1\.js\?v=/);assert.match(sw,/'\/ui\/scroll-fab-v1\.js'/);
  assert.match(js,/Nuevo remito/);assert.match(js,/Nuevo servicio/);assert.match(js,/abrirNuevoServicio/);assert.match(js,/is-collapsed/);
  assert.match(css,/is-collapsed/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/var\(--ax-accent/);
});
