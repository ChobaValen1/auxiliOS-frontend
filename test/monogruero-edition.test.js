const test=require('node:test');const assert=require('node:assert');const fs=require('fs');
const sb=fs.readFileSync('supabase.js','utf8'),js=fs.readFileSync('ui/monogruero-v1.js','utf8'),css=fs.readFileSync('ui/monogruero-v1.css','utf8'),cfg=fs.readFileSync('configuration-center.js','utf8'),html=fs.readFileSync('Index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
test('monogruero: el modo chofer viaja en cada pedido y el rol sale de la base',()=>{
  assert.match(sb,/_MONOGRUERO = window\.AUXILIOS_RUNTIME\.edition === 'monogruero'/);
  assert.match(sb,/headers\.set\('x-auxilios-mode', 'chofer'\)/);
  assert.match(sb,/rpc\('get_monogruero_profile_v1'\)/);
  assert.match(sb,/auxilios:perfil/);
});
test('monogruero: selector de modo, recortes y servicio asignado a él mismo',()=>{
  assert.match(js,/AUXILIOS_EDITION!=='monogruero'/);assert.match(js,/Modo oficina/);assert.match(js,/Modo chofer/);
  assert.match(js,/asignarRecursoServicio\('driver'/);assert.match(js,/asignarRecursoServicio\('truck'/);
  assert.match(css,/#nav-sueldos/);assert.match(css,/#nav-grilla/);assert.match(css,/prefers-reduced-motion/);
  assert.match(cfg,/admin && !mono \? link\('Tercerizados'/);assert.match(cfg,/mono \? '' : legacy\('Personal/);
  assert.match(html,/\/ui\/monogruero-v1\.js\?v=/);assert.match(sw,/'\/ui\/monogruero-v1\.js'/);
});
test('Sigma no cambia: sin edición monogruero no se manda el modo',()=>{
  assert.match(fs.readFileSync('runtime-config.js','utf8'),/edition: 'sigma'/);
  assert.match(sb,/if \(_MONOGRUERO && modoMonogruero\(\) === 'chofer'\)/);
});
