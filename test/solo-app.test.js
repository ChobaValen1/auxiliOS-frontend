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
  assert.match(ops,/Guardar y seguir después/);assert.match(ops,/Dos medios/);assert.match(ops,/Los pagos suman/);assert.match(ops,/Faltan confirmaciones/);
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
  assert.match(ops,/CAT_ICON=\{Combustible:'fuel'/);assert.match(ops,/notes:\$\('e-note'\)/);assert.match(ops,/Suma <b class="num">/);
});
test('Solo: con prestadora se factura a la empresa y el socio paga solo los adicionales',()=>{
  const ops=fs.readFileSync('solo/solo-ops.js','utf8'),fx=fs.readFileSync('solo/solo-facturacion.js','utf8');
  assert.doesNotMatch(ops,/Anular servicio/,'el remito ya no tiene «Anular»');
  assert.match(ops,/const owed=t=>particular\?t\.total:t\.extras/);assert.match(ops,/Se factura a \$\{esc\(cl\?\.name/);assert.match(ops,/Cobrar al socio/);
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
