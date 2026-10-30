const test=require('node:test');const assert=require('node:assert');const fs=require('fs');
const html=fs.readFileSync('solo.html','utf8'),js=fs.readFileSync('solo/solo.js','utf8'),css=fs.readFileSync('solo/solo.css','utf8'),cfg=fs.readFileSync('config.js','utf8'),sb=fs.readFileSync('supabase.js','utf8'),mig=fs.readFileSync('migrations/20261030160000_solo_v1.sql','utf8');
test('Solo: página propia, conectada a la base de la instalación',()=>{
  assert.match(html,/<title>AuxiliOS Solo<\/title>/);assert.match(html,/\/runtime-config\.js/);assert.match(html,/\/solo\/solo\.js/);
  assert.match(js,/createClient\(RT\.supabaseUrl,RT\.supabaseKey\)/);
  assert.match(cfg,/edition === 'monogruero'[^\n]*location\.replace\('\/solo\.html'/);
});
test('Solo: registro, alta inicial, inicio y tarifas',()=>{
  assert.match(js,/auth\.signUp/);assert.match(js,/signInWithPassword/);
  assert.match(js,/from\('solo_profiles'\)\.insert/);assert.match(js,/from\('solo_trucks'\)\.insert/);
  assert.match(js,/kind:'particular'/);assert.match(js,/rpc\('solo_month_summary_v1'/);
  assert.match(js,/from\('solo_rates'\)\.upsert/);
  assert.doesNotMatch(js,/innerHTML=[^;]*\$\{c\.name\}/,'los nombres se escapan');
  assert.match(css,/prefers-reduced-motion/);assert.match(css,/safe-area-inset-bottom/);
});
test('Solo: cada gruero ve solo lo suyo y el modo oficina/chofer ya no existe',()=>{
  assert.match(mig,/using \(owner_id = \(select auth\.uid\(\)\)\) with check \(owner_id = \(select auth\.uid\(\)\)\)/);
  assert.match(mig,/'Cliente inexistente'/);
  assert.doesNotMatch(sb,/x-auxilios-mode/);assert.ok(!fs.existsSync('ui/monogruero-v1.js'));
});
