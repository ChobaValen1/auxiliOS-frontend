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
  assert.match(fs.readFileSync('solo/solo-config.js','utf8'),/from\('solo_rates'\)\.upsert/);
  assert.doesNotMatch(js,/innerHTML=[^;]*\$\{c\.name\}/,'los nombres se escapan');
  assert.match(css,/prefers-reduced-motion/);assert.match(css,/safe-area-inset-bottom/);
});
test('Solo: cada gruero ve solo lo suyo y el modo oficina/chofer ya no existe',()=>{
  assert.match(mig,/using \(owner_id = \(select auth\.uid\(\)\)\) with check \(owner_id = \(select auth\.uid\(\)\)\)/);
  assert.match(mig,/'Cliente inexistente'/);
  assert.doesNotMatch(sb,/x-auxilios-mode/);assert.ok(!fs.existsSync('ui/monogruero-v1.js'));
});
test('Solo etapa 1c: servicio con precio por tarifa, remito con firma y gastos',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');
  assert.match(html,/\/solo\/solo-ops\.js/);assert.match(ops,/function rateFor/);assert.match(ops,/Math\.max\(0,\(Number\(km\)\|\|0\)-Number\(rate\.included_km/);
  assert.match(ops,/from\('solo_services'\)\.insert/);assert.match(ops,/status:'signed'/);assert.match(ops,/storage\.from\('solo_files'\)\.upload/);
  assert.match(ops,/conf_service/);assert.match(ops,/navigator\.share/);assert.match(ops,/from\('solo_expenses'\)\.insert/);
  assert.match(ops,/period_months:fixed\?Number\(\$\('e-period'\)\.value\):null/);assert.match(css,/\[hidden\]\{display:none!important\}/);
});
test('Solo: el remito es por pasos, igual que el del chofer en Flota',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');
  assert.match(ops,/const STEPS=\['Servicio','Socio','Adicionales','Evidencia','Firma'\]/);
  for(const l of ['Frente del vehículo','Lateral','Daños o estado adicional','Odómetro'])assert.ok(ops.includes(l),l);
  for(const l of ['Conformidad con el servicio','Aceptación de cargos variables','Sin daños reportados','Conformidad de arrastre','Socio ausente (firma el chofer)'])assert.ok(ops.includes(l),l);
  assert.match(ops,/Guardar y seguir después/);assert.match(ops,/Dos medios/);assert.match(ops,/Los dos medios suman/);assert.match(ops,/Faltan confirmaciones/);
  assert.match(ops,/function validate\(n\)/);assert.match(ops,/UI\(\)\.validateForm\(panel\)/);
});
test('Solo: app instalable en el celular, sin zoom y sin desplazar la página',()=>{
  const pwa=fs.readFileSync('solo/solo-pwa.js','utf8'),sw=fs.readFileSync('solo-sw.js','utf8'),man=JSON.parse(fs.readFileSync('solo-manifest.json','utf8')),root=fs.readFileSync('sw.js','utf8');
  assert.match(html,/maximum-scale=1, user-scalable=no/);assert.match(html,/rel="manifest" href="\/solo-manifest\.json"/);assert.match(html,/apple-touch-icon/);assert.match(html,/\/solo\/solo-pwa\.js/);
  assert.equal(man.start_url,'/solo.html');assert.equal(man.scope,'/solo');assert.equal(man.display,'standalone');
  assert.match(pwa,/register\('\/solo-sw\.js',\{scope:'\/solo'\}\)/,'no pisa el service worker de Flota');
  assert.match(pwa,/beforeinstallprompt/);assert.match(pwa,/Agregar a inicio/);assert.match(pwa,/localStorage/);assert.match(pwa,/gesturestart/);
  assert.match(sw,/'\/solo\.html'/);assert.match(sw,/supabase\.co/);assert.match(root,/'\/solo\/solo-pwa\.js'/);
  assert.match(css,/html,body\{height:100%;overflow:hidden/);assert.match(css,/height:100dvh/);assert.match(css,/font-size:16px/);
});
test('Solo: barra con íconos, ojito en la contraseña y recuperación por email',()=>{
  assert.match(js,/\['inicio','Inicio','layout-dashboard'\]/);assert.match(js,/\/ui\/icons\.svg#/);
  assert.match(js,/data-eye=/);assert.match(js,/'eye-off'/);assert.match(js,/Mostrar contraseña/);
  assert.match(js,/emailRedirectTo:backUrl\(\)/);assert.match(js,/resetPasswordForEmail\(email,\{redirectTo:backUrl\(\)\}\)/);
  assert.match(js,/auth\.resend\(\{type:'signup'/);assert.match(js,/PASSWORD_RECOVERY/);assert.match(js,/auth\.updateUser\(\{password\}\)/);
  assert.match(js,/identities\.length/,'email ya registrado');
});
test('Solo: nuevo servicio por pasos con tarjetas y remito sin N.º para escribir',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');
  assert.match(ops,/data-kind="prestadora"/);assert.match(ops,/data-kind="particular"/);assert.match(ops,/'¿Qué prestadora\?'/);assert.match(ops,/'¿Qué servicio\?'/);assert.match(ops,/'Precio acordado'/);
  assert.match(ops,/go\('clientes-nueva'\)/);
  assert.doesNotMatch(ops,/<label>N\.º remito<\/label>/);assert.match(ops,/\{bare:true\}/);
});
test('Solo: facturación agrupada por prestadora (facturado → cobrado) con resumen en PDF',()=>{
  const fx=fs.readFileSync('solo/solo-facturacion.js','utf8');
  assert.match(html,/\/solo\/solo-facturacion\.js/);assert.match(js,/data-go="facturacion"/);assert.match(js,/id="k-billed"/);
  assert.match(fx,/views\.facturacion=/);assert.match(fx,/\.neq\('status','cancelled'\)/,'los anulados no se facturan');
  assert.match(fx,/s\.status==='signed'/,'solo los firmados entran en la facturación');
  assert.match(fx,/invoiced_at:today\(\)/);assert.match(fx,/paid_at:new Date\(\)\.toISOString\(\)/);assert.match(fx,/\.in\('id',next\.rows\.map/);
  assert.match(fx,/addDays\(invoicedOn,client\.payment_days\)/,'vence según los días de pago');assert.match(fx,/'Vencido'/);
  assert.match(fx,/Resumen de servicios/);assert.match(fx,/navigator\.share/);assert.match(fx,/Confirmar \$\{next\.rows\.length\} remito/);
});
test('Solo: remito sin «Llegada», medios de pago con botones y firma con estados como en Flota',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');
  assert.doesNotMatch(ops,/Llegué|<label>Llegada<\/label>/);
  assert.match(ops,/class="pay-chip" data-m="\$\{k\}"/);assert.match(ops,/PAY_ICON=\{cash:'banknote'/);
  for(const t of ['Faltan conformidades','Falta la firma del socio','Falta la aclaración','Listo para finalizar','Sin firma','Firma registrada'])assert.ok(ops.includes(t),t);
  assert.match(css,/\.conf-area\{flex:4 1 0/);assert.match(css,/\.pad-wrap\{flex:6 1 0/,'60% firma / 40% conformidades');
  assert.match(ops,/pad\.width=Math\.round\(r0\.width\*dpr\)/,'el trazo no se deforma');
  assert.match(ops,/Remito creado exitosamente/);assert.match(ops,/doneView\(box,s,cl,tp,tk\)/);assert.match(ops,/Enviar remito \(PDF\)/);
});
test('Solo: Gastos con total del mes, en qué se va la plata, movimientos por día y fijos',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');
  assert.match(ops,/Gastaste en/);assert.match(ops,/\['categorias','En qué'\],\['movimientos','Movimientos'\],\['fijo','Fijos'\]/);
  assert.match(ops,/sort\(\(p,q\)=>q\.t-p\.t\)/,'categorías de mayor a menor');assert.match(ops,/from\('solo_expenses'\)\.delete\(\)/);
  assert.match(ops,/CAT_ICON=\{Combustible:'fuel'/);assert.match(ops,/notes:\$\('e-note'\)/);
});
test('Solo: con prestadora se factura a la empresa y el socio paga solo los adicionales',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8'),fx=fs.readFileSync('solo/solo-facturacion.js','utf8');
  assert.doesNotMatch(ops,/Anular servicio/,'el remito ya no tiene «Anular»');
  assert.match(ops,/const owed=t=>particular\?t\.total:t\.extras/);assert.match(ops,/Paga el socio/);
  const pt=ops.slice(ops.indexOf('function paintTotal'),ops.indexOf('function payUI'));assert.doesNotMatch(pt,/factura/i,'en Adicionales solo se ve lo que paga el socio');
  assert.doesNotMatch(ops,/rm-context|paintContext/,'Socio sin el resumen de arriba');
  assert.match(ops,/payment_1_amount:m1\?\(mixed\?num\(\$\('r-p1a'\)\.value\):o\):null/,'con un medio se cobra lo que corresponde, sin escribir el monto');
  assert.match(ops,/Los dos medios suman/);assert.match(ops,/Montos por medio aparecen solo con dos medios|Los montos por medio aparecen solo con dos medios/);
  assert.match(fx,/billOf=\(client,s\)=>client\.kind==='particular'\?Number\(s\.total\|\|0\):Math\.max\(0,Number\(s\.total\|\|0\)-paidHere\(s\)\)/);
});
test('Solo: «Ver remito» ordenado: servicio (N.º, patente, vehículo, recorrido) y cliente (nombre y contacto)',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');const v=ops.slice(ops.indexOf('function signedView'));
  const order=['N.º de servicio','plate big','rv-vname','rv-route','Cliente','rv-name','rv-contact'].map(k=>v.indexOf(k));
  assert.ok(order.every(i=>i>0),'están todas las partes');assert.deepEqual([...order].sort((a,b)=>a-b),order,'en ese orden');
  assert.match(v,/href="tel:/);assert.match(v,/href="mailto:/);
});
test('Solo: «Remito creado» con patente, N.º de servicio y cliente, y el desglose ordenado',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');const d=ops.slice(ops.indexOf('function doneView'),ops.indexOf('/* ── Remito firmado'));
  const order=['class="plate"','done-chip">N.º','Particular','Precio acordado','${kmEx}','Peajes','Total del servicio','Pagó el socio','A facturar a'].map(k=>d.indexOf(k));
  assert.ok(order.every(i=>i>0),'están todas las partes');assert.deepEqual([...order].sort((a,b)=>a-b),order,'en ese orden');
  assert.match(ops,/function rateForAt/);
});
test('Solo: foto del ticket en los gastos y avisos de cobro en Inicio',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8'),fx=fs.readFileSync('solo/solo-facturacion.js','utf8');
  assert.match(ops,/id="e-file"/);assert.match(ops,/C\.user\.id\+'\/receipts\/'/,'el ticket va en la carpeta del gruero');assert.match(ops,/receipt_path\};/);
  assert.match(ops,/showReceipt\(x\.receipt_path\)/);assert.match(ops,/function showReceipt/);assert.match(ops,/await shrink\(ticket\)/);
  assert.match(fx,/async function alerts\(\)/);assert.match(fx,/\.eq\('status','signed'\)\.is\('paid_at',null\)/);
  assert.match(fx,/addDays\(s\.invoiced_at,c\.payment_days\)/);assert.match(fx,/te debe/);assert.match(fx,/sin facturar/);assert.match(fx,/Vence hoy/);
  assert.match(js,/id="alerts"/);assert.match(js,/async function renderAlerts/);assert.match(js,/go\('facturacion-'\+a\.client\)/);
});
test('Solo: nuevo gasto con teclado propio, repetir, detalle que sugiere categoría y aviso de renovación de fijos',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8'),fx=fs.readFileSync('solo/solo-facturacion.js','utf8');const g=ops.slice(ops.indexOf('async function gastoNuevo'));
  assert.match(g,/class="gx-pad"/);assert.match(g,/'Sumar otro ticket'/);assert.match(g,/expr\.split\('\+'\)/,'suma varios tickets');
  assert.match(g,/pickCategory\(kind,cat\)/,'la categoría se elige en un modal');assert.match(g,/Repetir/);assert.match(g,/if\(CATS\[kind\]\.includes\(p\.category\)\)setCat\(p\.category\)/,'el detalle pone la categoría');
  assert.match(g,/'¿Cuándo fue\?'/);assert.match(g,/'¿Cuántos meses cubre\?'/);assert.match(g,/Marcá el monto con el teclado/);
  assert.doesNotMatch(g,/b\.disabled=true/,'el estado de guardado lo maneja solo-ui');
  assert.match(fx,/Renová \$\{x\.category/);assert.match(js,/if\(a\.go\)return go\(a\.go\)/);
});
test('Solo: gasto con «Elegir categoría» en modal, ticket claro y ficha que se edita solo con «Modificar» y confirma cambios y borrado',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');
  assert.match(ops,/Elegir categoría/);assert.match(ops,/function pickCategory/);assert.match(ops,/Sacar foto del ticket/);
  assert.match(ops,/function gastoVer/);assert.match(ops,/data-open="\$\{x\.id\}"/);assert.match(ops,/go\('gastos-ver-'\+b\.dataset\.open\)/);
  const v=ops.slice(ops.indexOf('async function gastoVer'),ops.indexOf('async function gastoNuevo'));
  assert.match(v,/disabled>/,'la ficha arranca solo para ver');assert.match(v,/Modificar/);
  assert.match(v,/confirmBox\('¿Eliminar este gasto\?'/);assert.match(v,/confirmBox\('¿Guardar los cambios\?'/);assert.match(v,/if\(!ok\)return;/);
  assert.doesNotMatch(ops,/data-del=/,'ya no se borra desde la lista sin confirmar');
});
test('Solo: nuevo gasto usa toda la pantalla (teclado abajo, monto con el contexto del mes)',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');
  assert.match(css,/\.gx-amount\{flex:1 1 auto;max-height:none/);assert.match(css,/\.gx-pad\{margin-top:auto\}/);
  assert.match(ops,/id="gx-ctx"/);assert.match(ops,/Gastos del día en /);
});
test('Solo etapa 3: Mis números (ganancia por servicio y km, punto de equilibrio, 6 meses, vencimientos)',()=>{
  const nx=fs.readFileSync('solo/solo-numeros.js','utf8');
  assert.match(html,/\/solo\/solo-numeros\.js/);assert.match(js,/\['k-left','numeros'\]/);assert.match(js,/data-go="numeros"/);
  assert.match(nx,/views\.numeros=/);assert.match(nx,/left\/n/);assert.match(nx,/left\/km/);
  assert.match(nx,/perSvc=n\?\(billed-variable\)\/n:0/);assert.match(nx,/Math\.ceil\(fixedM\/perSvc\)/,'punto de equilibrio con lo que deja cada servicio');
  assert.match(nx,/\[\.\.\.Array\(6\)\]/);assert.match(nx,/solo_month_summary_v1/);assert.match(nx,/Vencimientos/);
});
test('Solo: modo sin señal (copia local, cola de cambios y subida al volver la señal)',()=>{
  const off=fs.readFileSync('solo/solo-offline.js','utf8');
  assert.match(html,/\/solo\/solo-offline\.js/);assert.ok(html.indexOf('solo-offline.js')<html.indexOf('/solo/solo.js'),'carga antes que la app');
  assert.match(js,/createClient\(RT\.supabaseUrl,RT\.supabaseKey,\{global:\{fetch:off\.fetch\}\}\)/);assert.match(js,/SoloOffline\.setUser/);
  assert.match(js,/que todavía no se subieron/,'avisa antes de cerrar sesión con cambios sin subir');
  assert.match(off,/indexedDB\.open\('auxilios-solo-offline'/);assert.match(off,/crypto\.randomUUID\(\)/,'altas sin señal con id del teléfono');
  assert.match(off,/addEventListener\('online'/);assert.match(off,/se subieron/);assert.match(off,/body\.append\('',it\.blob\)/,'las fotos se suben como las manda supabase-js');
  assert.match(off,/async function monthSummary/);assert.match(off,/url\.includes\('\/auth\/v1\/'\)\)return realFetch/,'el ingreso no pasa por la copia');
  for(const f of ['sw.js','solo-sw.js'])assert.match(fs.readFileSync(f,'utf8'),/'\/solo\/solo-offline\.js'/);
});
test('Solo sin señal: los filtros de la copia local se comportan como la base',()=>{
  const vm=require('vm');const ctx={window:{fetch(){},AUXILIOS_RUNTIME:{}},addEventListener(){},document:{addEventListener(){}},navigator:{onLine:true},URL,Response:class{},console};ctx.window.window=ctx.window;
  vm.createContext(ctx);vm.runInContext("var window=this.window;"+fs.readFileSync("solo/solo-offline.js","utf8"),ctx);
  const O=ctx.window.SoloOffline;const q=O._parse('https://x.supabase.co/rest/v1/solo_services?select=*&status=neq.cancelled&service_date=gte.2026-10-01T03:00:00.000Z&service_date=lt.2026-11-01T03:00:00.000Z&order=service_date.desc');
  assert.equal(q.table,'solo_services');
  const row={status:'signed',service_date:'2026-10-30T18:42:00+00:00',paid_at:null,active:true};
  assert.ok(O._match(row,q.f));assert.ok(!O._match({...row,status:'cancelled'},q.f));assert.ok(!O._match({...row,service_date:'2026-11-02T10:00:00+00:00'},q.f));
  assert.ok(O._match(row,O._parse('https://x/rest/v1/t?paid_at=is.null&active=eq.true').f));
  assert.ok(!O._match(row,O._parse('https://x/rest/v1/t?active=eq.false').f));
});
test('Solo: configuración de prestadoras, tarifas y tipos con confirmaciones y sin borrar historial',()=>{
  const cf=fs.readFileSync('solo/solo-config.js','utf8');
  assert.match(html,/\/solo\/solo-config\.js/);assert.ok(html.indexOf('solo-ops.js')<html.indexOf('solo-config.js'),'usa las hojas de solo-ops');
  assert.match(cf,/views\.clientes=/);assert.match(cf,/views\.cliente=/);assert.match(cf,/views\.tipos=/);assert.doesNotMatch(js,/async function renderCliente/);
  assert.match(cf,/hasServices\?\(c\.active\?'Desactivar'/,'con servicios se desactiva, no se borra');
  assert.match(cf,/confirmBox\('¿Eliminar la prestadora\?'/);assert.match(cf,/confirmBox\('¿Guardar el precio nuevo\?'/);assert.match(cf,/Los servicios anteriores mantienen su precio/);
  assert.match(cf,/Historial de precios/);assert.match(cf,/cobrás/,'ejemplo en vivo');assert.match(cf,/update\(\{active:to\}\)/);
  assert.doesNotMatch(cf,/from\('solo_service_types'\)\.delete/,'los tipos se desactivan, no se borran');
  assert.doesNotMatch(cf,/innerHTML=[^;]*\$\{c\.name\}/,'los nombres se escapan');
});
test('Solo: Servicios por día (arranca en Hoy, días pasados solo para ver, aviso de remitos sin firmar)',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');const v=ops.slice(ops.indexOf('views.servicios='),ops.indexOf("const app=()=>"));
  assert.match(v,/day<=today\?day:today/,'no se puede elegir un día futuro');assert.match(v,/isToday\?`<button class="btn pri block" type="button" id="add">/,'solo en Hoy se crea');
  assert.match(v,/Volver a hoy/);assert.match(v,/Los servicios nuevos se cargan con la fecha de hoy/);
  assert.match(v,/\.eq\('status','open'\)\.lt\('service_date',dayStart\(today\)\.toISOString\(\)\)/,'remitos sin firmar de días anteriores');
  assert.match(v,/id="sv-pick"/);assert.match(v,/sv-strip/);
  const nv=ops.slice(ops.indexOf('views.nuevo='));assert.match(nv,/service_date:new Date\(\)\.toISOString\(\)/,'lo nuevo va con la fecha de hoy');
});
test('Solo: remito paso 1 (Servicio arriba con fecha tipo Gastos, Km debajo del recorrido) y la cruz descarta con confirmación',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');const w=ops.slice(ops.indexOf('function wizard('),ops.indexOf('// ── Paso 4: fotos por posición'));
  const p1=w.slice(w.indexOf('data-step="1"'),w.indexOf('data-step="2"'));
  assert.ok(p1.indexOf('Servicio</span>')<p1.indexOf('Vehículo</span>'),'Servicio va primero');
  assert.ok(p1.indexOf('id="r-dest"')<p1.indexOf('id="r-km"'),'Km debajo del recorrido');
  assert.match(p1,/id="r-day"/);assert.match(p1,/id="r-time" type="time"/);assert.doesNotMatch(p1,/datetime-local/);
  assert.match(w,/sheet\('¿Cuándo fue el servicio\?'/);assert.match(w,/max="\$\{t\}"/,'no se eligen días futuros');
  assert.match(w,/confirmBox\('¿Descartar este remito\?'/);assert.match(w,/from\('solo_services'\)\.delete\(\)\.eq\('id',s\.id\)/);assert.match(w,/go\('inicio'\)/);
  const x=w.slice(w.indexOf("$('rm-x').onclick"),w.indexOf("$('r-later').onclick"));assert.doesNotMatch(x,/save\(/,'la cruz no guarda');
  assert.doesNotMatch(w,/\$\('r-later'\)\.hidden/,'Guardar y seguir después está en todos los pasos');
});
test('Solo: pantalla de carga con contador hasta 100',()=>{
  assert.match(html,/id="boot" class="boot" role="progressbar"/);assert.match(html,/id="boot-n">0</);assert.match(html,/MutationObserver/);
  assert.match(html,/prefers-reduced-motion/);assert.doesNotMatch(html,/Cargando AuxiliOS Solo…<\/div>/);assert.match(css,/\.boot\.done\{/);
});
test('Solo: remito PDF con membrete de la grúa, marca de agua de AuxiliOS, fotos y sin tarifa de la prestadora',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8');const f=ops.slice(ops.indexOf('async function remitoPdf('),ops.indexOf('function prepPdf('));
  assert.match(f,/compress:true/);assert.match(f,/new doc\.GState\(\{opacity:\.045\}\)/,'marca de agua suave');assert.match(f,/txt\('AuxiliOS'/);
  assert.match(f,/P\.business_name/);assert.match(f,/Grúa '\+tk\.plate/);assert.match(f,/createSignedUrls\(paths,600\)/);assert.match(f,/Fotos del vehículo/);
  assert.match(f,/'VERIFICACIÓN'/);assert.match(f,/Página '\+i\+' de '\+n/);
  assert.match(f,/const rows=particular\?\[\['Precio acordado'/,'con prestadora no se muestra la tarifa');assert.doesNotMatch(f,/Se factura a '\+/);
  assert.match(ops,/setTimeout\(\(\)=>prepPdf\(s,cl,tp,tk\),600\)/,'el PDF se arma antes del toque');
});
test('Solo: datos del remito (CUIT, condición fiscal, logo) y verificación pública por QR',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8'),cf=fs.readFileSync('solo/solo-config.js','utf8'),ui=fs.readFileSync('solo/solo-ui.js','utf8');
  const m=fs.readFileSync('migrations/20261031130000_solo_remito_membrete_qr_v1.sql','utf8'),v=fs.readFileSync('solo-verificar.html','utf8'),vc=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.match(m,/add column if not exists cuit text check \(cuit is null or cuit ~ '\^\[0-9\]\{11\}\$'\)/);assert.match(m,/new\.verify_code:=old\.verify_code/,'el código no se cambia');
  assert.match(m,/security definer set search_path=''/);assert.match(m,/grant execute on function public\.solo_verify_remito_v1\(text\) to anon/);assert.match(m,/s\.status<>'open'/,'solo remitos firmados');
  assert.doesNotMatch(m.slice(m.indexOf('solo_verify_remito_v1')),/'total'|customer_phone|customer_doc|origin|destination/,'sin importes ni datos de contacto');
  assert.match(cf,/views\.perfil=/);assert.match(cf,/from\('solo_profiles'\)\.update\(patch\)/);assert.match(cf,/'image\/png'/);assert.match(js,/data-go="perfil"/);assert.match(js,/set profile\(p\)\{profile=p;\}/);
  assert.match(ui,/cuit:\{test:v=>cuitOk\(digits\(v\)\)/);assert.match(ui,/'pf-cuit':'cuit'/);
  assert.match(ops,/location\.origin\+'\/v\/'\+s\.verify_code/);assert.match(ops,/window\.qrcode\(0,'M'\)/);assert.match(ops,/P\.logo_path/);assert.match(html,/qrcode-generator@1\.4\.4/);
  assert.ok(vc.rewrites.findIndex(r=>r.source==='/v/:code')<vc.rewrites.findIndex(r=>r.source==='/(.*)'),'la ruta corta va antes del comodín');
  assert.match(v,/rpc\('solo_verify_remito_v1'/);assert.match(v,/noindex/);assert.match(v,/function esc\(/);
  assert.match(fs.readFileSync('solo-sw.js','utf8'),/startsWith\('\/solo-verificar'\)\)return/);
});
test('Solo: términos y privacidad al crear la cuenta, y ayuda y soporte',()=>{
  const t=fs.readFileSync('terminos-solo.html','utf8');
  assert.match(t,/id="terminos"/);assert.match(t,/id="privacidad"/);assert.match(t,/Ley N\.º 25\.326/);assert.match(t,/AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA/);assert.match(t,/No reemplaza la factura/);assert.doesNotMatch(t,/\[completar/,'sin datos pendientes');assert.match(t,/CUIT 20-47733776-8/);
  assert.match(js,/id="a-terms"/);assert.match(js,/if\(signup&&!\$\('a-terms'\)\.checked\)/,'sin aceptar no se crea la cuenta');assert.match(js,/terms_version:TERMS_VERSION,terms_accepted_at:/);
  assert.match(js,/id="help"/);assert.match(js,/id="a-help"/);assert.match(js,/'https:\/\/wa\.me\/'\+wa\+'\?text='\+encodeURIComponent/);assert.match(js,/RT\.supportWhatsapp/);
  const svg=fs.readFileSync('ui/icons.svg','utf8');for(const i of ['life-buoy','message-circle','mail'])assert.match(svg,new RegExp('id="'+i+'"'));
  assert.match(fs.readFileSync('solo-sw.js','utf8'),/if\(!\['\/solo\.html','\/solo'\]\.includes\(url\.pathname\)\)return;/,'solo la app se guarda como /solo.html');
});
