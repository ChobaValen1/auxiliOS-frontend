const test=require('node:test');const assert=require('node:assert');const fs=require('fs');
const {configuration,render}=require('../scripts/build-runtime-config.cjs');
test('instalación: sin variables queda Sigma, y todo lee la base de runtime-config.js',()=>{
  assert.equal(configuration({}),null);
  const rt=fs.readFileSync('runtime-config.js','utf8');
  assert.match(rt,/edition: 'sigma'/);assert.match(rt,/bcjcrlrrqfbipleiwkqi\.supabase\.co/);
  for(const f of ['supabase.js','remito.html'])assert.doesNotMatch(fs.readFileSync(f,'utf8'),/bcjcrlrrqfbipleiwkqi/,f+' no debe tener la base escrita a mano');
  assert.match(fs.readFileSync('config.js','utf8'),/AUXILIOS_RUNTIME\.supabaseUrl/);
  const html=fs.readFileSync('Index.html','utf8');assert.ok(html.indexOf('runtime-config.js')<html.indexOf('config.js?v='));
  assert.match(fs.readFileSync('remito.html','utf8'),/<script src="\/runtime-config\.js"><\/script>/);
  assert.match(fs.readFileSync('vercel.json','utf8'),/build-runtime-config\.cjs/);
});
test('instalación monogruero: valida las variables y rechaza llaves de servicio',()=>{
  const ok={AUXILIOS_EDITION:'monogruero',AUXILIOS_SUPABASE_URL:'https://abc123.supabase.co',AUXILIOS_SUPABASE_KEY:'sb_publishable_x1'};
  const c=configuration(ok);assert.equal(c.edition,'monogruero');assert.match(render(c),/"supabaseUrl": "https:\/\/abc123\.supabase\.co"/);
  assert.throws(()=>configuration({...ok,AUXILIOS_SUPABASE_KEY:'sb_secret_x'}),/publicable/);
  assert.throws(()=>configuration({...ok,AUXILIOS_EDITION:'otra'}),/EDITION/);
  assert.throws(()=>configuration({...ok,AUXILIOS_SUPABASE_URL:'http://x.com'}),/supabase\.co/);
});
test('instalación: datos de soporte opcionales y validados',()=>{
  const ok={AUXILIOS_EDITION:'monogruero',AUXILIOS_SUPABASE_URL:'https://abc123.supabase.co',AUXILIOS_SUPABASE_KEY:'sb_publishable_x1'};
  assert.equal(configuration(ok).supportWhatsapp,undefined);
  const c=configuration({...ok,AUXILIOS_SUPPORT_WHATSAPP:'+54 9 11 2345-6789',AUXILIOS_SUPPORT_EMAIL:'ayuda@auxilios.com.ar'});
  assert.equal(c.supportWhatsapp,'5491123456789');assert.equal(c.supportEmail,'ayuda@auxilios.com.ar');
  assert.throws(()=>configuration({...ok,AUXILIOS_SUPPORT_WHATSAPP:'123'}),/WHATSAPP/);assert.throws(()=>configuration({...ok,AUXILIOS_SUPPORT_EMAIL:'x@'}),/EMAIL/);
});
