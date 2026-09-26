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
  assert.doesNotMatch(sigma,/ofrecerEnvioRemitoWhatsApp/,'el chofer no envía el remito: lo hace Administración');
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

test('calidad y cobros: el cliente confirma lo cobrado y Administración ve el resumen',()=>{
  const mig=read('migrations/20260926120000_remito_quality_and_cash_check_v1.sql');
  assert.match(mig,/add column if not exists cobro_confirmado boolean/);
  assert.match(mig,/add column if not exists cobro_informado numeric\(12,2\)/);
  assert.match(mig,/create or replace function public\.get_remito_quality_summary_v1\(p_desde date default null, p_hasta date default null\)/);
  assert.match(mig,/app_private\.current_auxilios_role\(\) = any \(array\['administracion','supervision'\]\)/);
  assert.match(mig,/revoke all on function public\.get_remito_quality_summary_v1\(date, date\) from public, anon/);
  assert.match(mig,/app_private\.current_auxilios_role\(\) is distinct from 'administracion'/,'solo Administración marca revisado');
  const html=read('remito.html');
  assert.match(html,/Según el remito, pagaste/);
  assert.match(html,/if\(S\.cobro===null\)\{err\.textContent='Contanos si el importe que pagaste en el lugar es correcto\.'/,'el control de cobro es obligatorio');
  assert.match(html,/payload\.cobro_confirmado=S\.cobro;if\(S\.cobro===false\)payload\.cobro_informado=S\.cobroMonto/);
  const cal=read('remitos-calidad-v1.js');
  assert.match(cal,/rpc\('get_remito_quality_summary_v1'/);
  assert.match(cal,/rpc\('mark_remito_survey_reviewed_v1'/);
  assert.match(cal,/Cobros no confirmados/);
  const index=read('Index.html');
  assert.match(index,/id="rmx-views"[^>]*hidden/,'la pestaña solo aparece para Administración/Supervisión');
  assert.match(index,/data-view="calidad"/);
  assert.match(read('sigma.js'),/window\.RemitosCalidad\?\.syncRole\(\)/);
  assert.match(read('config.js'),/'\/remitos-calidad-v1\.js'/);
  assert.match(read('sw.js'),/'\/remitos-calidad-v1\.js'/);
});

test('enviar al cliente es tarea de Administración y queda registrado el canal',()=>{
  const sigma=read('sigma.js'),supa=read('supabase.js');
  const sheet=slice(sigma,'async function abrirEnvioRemitoCliente(d) {','// Con teléfono: abre el chat de ese número');
  assert.match(sheet,/El cliente no tiene WhatsApp/);
  assert.match(sheet,/registrarEntregaRemito\(d\.id, 'sin_whatsapp'\)/);
  assert.doesNotMatch(slice(sigma,'async function confirmarFirma','function _remitoEvidenceToken'),/abrirEnvioRemitoCliente|rwa-sheet/,'el chofer no ve el aviso al firmar');
  assert.match(sigma,/registrarEntregaRemito\(d\.id, 'whatsapp'\)/);
  assert.match(sigma,/registrarEntregaRemito\(d\.id, 'compartido'\)/);
  assert.match(sigma,/rpc\('register_remito_delivery_v1'/);
  assert.match(sigma,/chip\('sin_enviar', env, 'por enviar', 'is-amber'\)/);
  assert.match(sigma,/data-rmx-action="enviar"/);
  assert.match(supa,/rpc\('get_remitos_pendientes_envio_v1'\)/);
  assert.match(supa,/filtros\.estado === 'sin_enviar'/);
  const mig=read('migrations/20260926140000_remito_delivery_channel_v1.sql');
  assert.match(mig,/canal in \('whatsapp','compartido','sin_whatsapp'\)/);
  const pend=read('migrations/20260926150000_remitos_pendientes_envio_v1.sql');
  assert.match(pend,/interval '60 days' and l\.remito_id is null/);
  assert.match(pend,/array\['administracion','supervision'\]/);
  assert.match(read('remitos-calidad-v1.js'),/function vigilar\(\)/,'la pestaña se sincroniza aunque el módulo cargue tarde');
});

test('correcciones de la prueba QA: clic en fila, nota sin prompt, cobro en el panel y datos del Servicio por RPC',()=>{
  const sigma=read('sigma.js');
  assert.match(sigma,/closest\?\.\('#tbody-remitos tr\.rmx-row'\)[\s\S]{0,200}verRemitoModal\(tr\)/,'clic en la fila abre el detalle');
  const cal=read('remitos-calidad-v1.js');
  assert.doesNotMatch(cal,/prompt\(/,'la nota de revisión usa un cuadro propio');
  assert.match(cal,/id="rqc-nota"/);
  const panel=read('remitos-admin-panel-v1.js');
  assert.match(panel,/el cliente dice \$\{money\(sv\.cobro_informado\)\}/);
  assert.match(panel,/rpc\('get_remitos_service_info_v1'/);
  assert.doesNotMatch(panel+read('supabase.js'),/from\('operator_services'\)/,'authenticated no tiene SELECT sobre operator_services');
  const mig=read('migrations/20260926160000_remito_service_info_v1.sql');
  assert.match(mig,/array\['administracion','supervision','facturacion'\]/);
  assert.match(read('operator-service-bridge.js'),/\$\{s\.single_address\?'':`<div class="p3-fact-row"><span>Destino<\/span>/);
  assert.match(read('operator-service-lifecycle.js'),/\['Tipo',s\.service_name\|\|s\.concept_name\|\|O\(\)\?\.concept\?\.\(s\.primary_concept_id\)\?\.name\|\|'—'\]/);
});

test('panel del remito: pestañas Detalle | Encuesta | Cambios',()=>{
  const panel=read('remitos-admin-panel-v1.js');
  assert.match(panel,/\[\['detalle','Detalle'\],\['encuesta',etiquetaEncuesta\],\['cambios',/);
  assert.match(panel,/P\.tab==='encuesta'\?renderEncuesta\(\)/);
  assert.doesNotMatch(slice(panel,'function renderDetalle(','function renderAnular('),/renderEncuesta\(\)/,'la encuesta ya no está dentro de Detalle');
  assert.match(read('remitos-calidad-v1.js'),/abrirDetalleRemitoAdmin\(\$\{Number\(a\.remito_id\)\},\{tab:'encuesta'\}\)/);
});
