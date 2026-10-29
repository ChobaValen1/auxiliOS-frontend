const test=require('node:test');const assert=require('node:assert');const fs=require('fs');
const html=fs.readFileSync('Index.html','utf8'),js=fs.readFileSync('ui/tooltip-v1.js','utf8'),css=fs.readFileSync('ui/tooltip-v1.css','utf8'),sw=fs.readFileSync('sw.js','utf8');
test('U13 tooltip: se carga, es accesible y respeta el movimiento reducido',()=>{
  assert.match(html,/\/ui\/tooltip-v1\.js\?v=/);assert.match(html,/\/ui\/tooltip-v1\.css\?v=/);
  assert.match(sw,/'\/ui\/tooltip-v1\.js'/);
  assert.match(js,/role','tooltip'/);assert.match(js,/aria-describedby/);assert.match(js,/Escape/);assert.match(js,/\(hover:hover\)/);
  assert.match(css,/var\(--ax-accent/);assert.match(css,/prefers-reduced-motion/);
});
