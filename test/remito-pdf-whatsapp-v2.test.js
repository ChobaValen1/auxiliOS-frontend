const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
const slice=(src,start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a);assert.ok(a>=0&&b>a,`no se encontró ${start}`);return src.slice(a,b);};

test('WhatsApp: el teléfono argentino se convierte al formato de wa.me',()=>{
  const ctx={};
  vm.runInNewContext(slice(read('sigma.js'),'function telefonoWhatsApp(tel) {','function textoWhatsAppRemito(')+';this.fn=telefonoWhatsApp;',ctx);
  const f=ctx.fn;
  assert.equal(f('1151176553'),'5491151176553');
  assert.equal(f('11 5117-6553'),'5491151176553');
  assert.equal(f('01151176553'),'5491151176553');
  assert.equal(f('111551176553'),'5491151176553','15 después del 11');
  assert.equal(f('+54 9 11 5117 6553'),'5491151176553');
  assert.equal(f('541151176553'),'5491151176553');
  assert.equal(f('3514123456'),'5493514123456');
  assert.equal(f('12345'),'');
  assert.equal(f(''),'');
});

test('WhatsApp: con número va directo al chat; sin número comparte el PDF real',()=>{
  const js=slice(read('sigma.js'),'async function compartirRemitoPorWhatsApp(','async function descargarRemitoPDF(');
  assert.match(js,/https:\/\/wa\.me\/\$\{numero\}\?text=/);
  assert.match(js,/window\.RemitoPdf\.blob\(d\)/,'el archivo compartido es el PDF del remito, no un texto');
  assert.doesNotMatch(js,/html2pdf\(\)/);
  const sigma=read('sigma.js');
  assert.match(sigma,/setTimeout\(\(\) => ofrecerEnvioRemitoWhatsApp\(nro2\), 2500\)/,'se ofrece enviar al cliente al finalizar');
});

test('PDF v2: documento de texto, datos de empresa reales y mismo código de verificación',()=>{
  const pdf=read('remito-pdf-v2.js'),sigma=read('sigma.js');
  assert.match(pdf,/new J\(\{unit:'mm',format:'a4',orientation:'portrait',compress:true\}\)/);
  assert.doesNotMatch(pdf,/html2canvas/);
  assert.match(pdf,/CompanyDocuments\?\.load/);
  assert.match(pdf,/const hash=await hashRemito\(d\)/);
  assert.match(pdf,/\[d\.nro,d\.patente,d\.createdAt\|\|'',d\.firmadoAt\|\|'',d\.km\|\|'',String\(d\.peaje\|\|0\),String\(d\.excedente\|\|0\),String\(d\.otros\|\|0\)\]\.join\('\|'\)/,'mismo cálculo del código de verificación');
  assert.match(pdf,/SIGMA-REMITO\|\$\{d\.nro\}\|\$\{d\.patente\}\|\$\{d\.firmadoAt\|\|''\}\|\$\{hash\}/,'mismo contenido del QR que la versión anterior');
  assert.match(pdf,/filter\(\(\[,v\]\)=>v>0\)/,'solo las líneas de cargos con importe');
  assert.match(pdf,/Aprobado por Administración/);
  assert.doesNotMatch(sigma,/_REMITO_EMPRESA|Av\. Ejemplo 1234|contacto@sigmaremolques\.com/,'sin datos de empresa de relleno');
  assert.match(sigma,/await window\.RemitoPdf\.download\(d\)/);
  assert.match(read('config.js'),/'\/remito-pdf-v2\.js'/);
  assert.match(read('sw.js'),/'\/remito-pdf-v2\.js'/);
});

test('remito del chofer: teléfono de 10 dígitos o "El cliente no informa teléfono"',()=>{
  const m=read('remito-mobile-flow-v3.js');
  assert.match(m,/id="rem-telefono-no-informa"/);
  assert.match(m,/const phoneValid=v=>\/\^\\d\{10\}\$\/\.test/);
  assert.match(m,/missing=row\?\.dataset\.mode==='required'&&!value&&!noInforma/);
});

test('link público del remito: página, encuesta y envío por WhatsApp',()=>{
  const mig=read('migrations/20260926000000_remito_public_link_and_survey_v1.sql');
  assert.match(mig,/create table if not exists public\.remito_public_links/);
  assert.match(mig,/create table if not exists public\.remito_surveys/);
  assert.match(mig,/grant execute on function public\.get_public_remito_v1\(text\) to anon, authenticated/);
  assert.match(mig,/revoke all on function public\.create_remito_public_link_v1\(integer\) from public, anon/);
  assert.match(mig,/v_driver = auth\.uid\(\)/,'el chofer solo comparte sus remitos');
  assert.doesNotMatch(slice(mig,'create or replace function public.get_public_remito_v1','$function$;'),/'telefono'/,'la página pública no expone el teléfono');
  const html=read('remito.html');
  assert.match(html,/rpc\('get_public_remito_v1'/);
  assert.match(html,/rpc\('submit_remito_survey_v1'/);
  assert.match(html,/<script src="\/remito-pdf-v2\.js" defer><\/script>/);
  assert.match(html,/km:String\(r\.km_reales\|\|'—'\),peaje:String\(r\.imp_peaje\|\|0\)/,'mismo formato que la app para el código de verificación');
  assert.match(read('vercel.json'),/"source": "\/r\/:token", "destination": "\/remito\.html"/);
  assert.match(read('sw.js'),/url\.pathname\.startsWith\('\/r\/'\)\|\|url\.pathname==='\/remito\.html'/);
  const sigma=read('sigma.js');
  assert.match(sigma,/rpc\('create_remito_public_link_v1', \{ p_remito_id: Number\(remitoId\) \}\)/);
  assert.match(sigma,/Descargá tu remito y contanos cómo te atendimos/);
  assert.match(read('remitos-admin-panel-v1.js'),/seccion\('Encuesta del cliente'/);
});
