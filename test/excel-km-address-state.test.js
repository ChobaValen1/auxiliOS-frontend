const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const address=require('../address-parts-v1.js');
const kmRounding=require('../km-rounding-v1.js');

/* Carga el exportador en un navegador mínimo para usar las columnas reales. */
function loadExport(rules){
  const R={...kmRounding};kmRounding._setRules(rules);
  const el=()=>({id:'',textContent:'',appendChild(){},remove(){}});
  const window={AuxiliosAddress:address,AuxiliosKmRounding:kmRounding,localStorage:{getItem:()=>null,setItem(){}}};
  const document={readyState:'complete',getElementById:()=>null,createElement:el,head:{appendChild(){}},body:{appendChild(){}},querySelector:()=>null,addEventListener(){}};
  vm.runInNewContext(read('operator-billing-export.js'),{window,document,console,Intl,Date,Math,Number,String,Set,Map,JSON,encodeURIComponent});
  const cols=new Map(window.OperatorBillingExcel.serviceColumns.map(c=>[c.id,c]));
  return {cols,R};
}

test('direcciones de Google: calle, localidad y provincia en cada formato que llega',()=>{
  const cases=[
    ['De las Gaviotas 35, B7167EXA Pinamar, Provincia de Buenos Aires',{street:'De las Gaviotas 35',locality:'Pinamar',province:'Buenos Aires'}],
    ['Gral. Iriarte 1756, B1834DWX Temperley, Provincia de Buenos Aires',{street:'Gral. Iriarte 1756',locality:'Temperley',province:'Buenos Aires'}],
    // CABA: el código postal viene pegado a la provincia y no hay localidad. Antes la calle quedaba en Localidad.
    ['Av. 9 de Julio & Rivadavia, C1002 Cdad. Autónoma de Buenos Aires',{street:'Av. 9 de Julio & Rivadavia',locality:'CABA',province:'CABA'}],
    ['Iguazú 775, C1437ETK C1437ETK, Cdad. Autónoma de Buenos Aires',{street:'Iguazú 775',locality:'CABA',province:'CABA'}],
    ['Comuna 4, Av. Almafuerte 857, C1437JLI Cdad. Autónoma de Buenos Aires',{street:'Comuna 4, Av. Almafuerte 857',locality:'CABA',province:'CABA'}],
    // «, Argentina» al final: antes la localidad salía «Argentina».
    ['C. 142 18, B1931 Ensenada, Provincia de Buenos Aires, Argentina',{street:'C. 142 18',locality:'Ensenada',province:'Buenos Aires'}],
    // Letras del código postal adelante: antes la Dirección de Servicios mostraba sólo «ACR».
    ['ACR, Vélez Sársfield 2501, B1824 Lanús, Provincia de Buenos Aires',{street:'Vélez Sársfield 2501',locality:'Lanús',province:'Buenos Aires'}],
    ['YPF, Ruta 2 km 50, B1900ABC La Plata, Provincia de Buenos Aires',{street:'YPF, Ruta 2 km 50',locality:'La Plata',province:'Buenos Aires'}],
    // Google marca «Cdad. Autónoma» a una localidad del conurbano: el código postal B manda.
    ['AAG, Av. Bartolomé Mitre 665, B1870 Avellaneda, Cdad. Autónoma de Buenos Aires',{street:'Av. Bartolomé Mitre 665',locality:'Avellaneda',province:'Buenos Aires'}],
    // Una sola parte antes de la provincia: calle si parece calle, localidad si no.
    ['C. 167 & C. 600, Provincia de Buenos Aires',{street:'C. 167 & C. 600',locality:'',province:'Buenos Aires'}],
    ['Villa Gesell, Provincia de Buenos Aires',{street:'',locality:'Villa Gesell',province:'Buenos Aires'}],
    ['B1834 Temperley, Provincia de Buenos Aires',{street:'',locality:'Temperley',province:'Buenos Aires'}],
    // La altura de la calle no es código postal.
    ['Av. Corrientes 1234, CABA',{street:'Av. Corrientes 1234',locality:'CABA',province:'CABA'}],
    ['-34.463881, -58.697038',{street:'-34.463881, -58.697038',locality:'',province:''}],
    ['DEL PEJEREY 1511\tPINAMAR',{street:'DEL PEJEREY 1511',locality:'PINAMAR',province:''}],
    ['',{street:'',locality:'',province:''}]
  ];
  for(const [raw,expected] of cases)assert.deepEqual(address.parse(raw),expected,raw);
});

test('Servicios y el Excel usan el mismo separador de direcciones',()=>{
  const services=read('operator-services.js'),billingExport=read('operator-billing-export.js'),config=read('config.js'),sw=read('sw.js');
  assert.match(services,/window\.AuxiliosAddress\?\.parse\(raw\)/);
  assert.match(billingExport,/window\.AuxiliosAddress\?\.parse\(raw\)/);
  assert.doesNotMatch(services,/chunks\[0\]/,'la dirección ya no es sólo la primera parte antes de la coma');
  assert.ok(config.indexOf("'/address-parts-v1.js'")>0&&config.indexOf("'/address-parts-v1.js'")<config.indexOf("'/operator-services.js'"));
  assert.ok(config.indexOf("'/km-rounding-v1.js'")>0&&config.indexOf("'/km-rounding-v1.js'")<config.indexOf("'/operator-billing.js'"));
  assert.match(sw,/'\/address-parts-v1\.js','\/km-rounding-v1\.js'/);
});

test('redondeo de km: asfalto y ripio por separado, según la regla vigente de la prestadora',()=>{
  kmRounding._setRules([
    {company_id:'a',valid_from:'2026-10-01',valid_until:null,km_rounding_mode:'nearest_integer'},
    {company_id:'a',valid_from:'2026-01-01',valid_until:'2026-09-30',km_rounding_mode:'decimal'},
    {company_id:'b',valid_from:'2026-01-01',valid_until:null,km_rounding_mode:'decimal'}
  ]);
  assert.equal(kmRounding.modeFor('a','2026-10-15T15:00:00Z'),'nearest_integer');
  assert.equal(kmRounding.modeFor('a','2026-09-15T15:00:00Z'),'decimal');
  // 1/10 a las 01:00 en Argentina es 30/9 a las 22:00: la fecha se toma en hora argentina.
  assert.equal(kmRounding.modeFor('a','2026-10-01T01:00:00Z'),'decimal');
  assert.equal(kmRounding.modeFor('b','2026-10-15T15:00:00Z'),'decimal');
  assert.equal(kmRounding.modeFor('sin-regla','2026-10-15T15:00:00Z'),'decimal');
  for(const [a,g,ra,rg] of [[90.4,0,90,0],[90.5,0,91,0],[90.7,0,91,0],[2.6,3.7,3,4],[0.4,0.4,0,0]]){
    const r=kmRounding.apply('nearest_integer',a,g,a+g);
    assert.deepEqual([r.asphalt,r.gravel,r.total],[ra,rg,ra+rg],`${a}+${g}`);
  }
  assert.equal(kmRounding.apply('nearest_integer',null,null,12.6).total,13);
  assert.deepEqual(kmRounding.apply('decimal',90.4,0.3,90.7),{asphalt:90.4,gravel:0.3,total:90.7,rounded:false});
});

test('Excel: KM Asfalto, Ripio, Total y KM activado salen redondeados si la prestadora redondea',()=>{
  const {cols}=loadExport([{company_id:'a',valid_from:'2026-01-01',valid_until:null,km_rounding_mode:'nearest_integer'}]);
  const value=(id,r)=>cols.get(id).value(r);
  const base={company_id:'a',scheduled_for:'2026-10-15T15:00:00Z',asphalt_km:2.6,gravel_km:3.7,total_km:6.3,quote:{}};
  assert.deepEqual(['asphalt_km','gravel_km','total_km'].map(id=>value(id,base)),[3,4,7]);
  // La cotización del servicio manda sobre la regla leída aparte.
  const decimalQuote={...base,quote:{km_rounding_mode:'decimal'}};
  assert.deepEqual(['asphalt_km','gravel_km','total_km'].map(id=>value(id,decimalQuote)),[2.6,3.7,6.3]);
  const other={...base,company_id:'b'};
  assert.deepEqual(['asphalt_km','gravel_km','total_km'].map(id=>value(id,other)),[2.6,3.7,6.3]);
  assert.equal(value('activation_km',{...base,driver_activated:true,activation_kind:'movement',activation_km:12.5}),13);
  assert.equal(value('activation_km',{...other,driver_activated:true,activation_kind:'movement',activation_km:12.5}),12.5);
});

test('Excel: Estado es FINALIZADO, ACTIVADO MOVIDA o ACTIVADO ORIGEN y no hay columnas de activado aparte',()=>{
  const {cols}=loadExport([]);
  const state=r=>cols.get('status').value(r);
  assert.equal(cols.get('status').header,'Estado');
  assert.equal(state({driver_activated:false,billing_status:'pending'}),'FINALIZADO');
  assert.equal(state({driver_activated:true,activation_kind:'movement'}),'ACTIVADO MOVIDA');
  assert.equal(state({driver_activated:true,activation_kind:'origin'}),'ACTIVADO ORIGEN');
  for(const id of ['activated','activation_kind','activation_billing','base_price','service_number','logistics'])assert.equal(cols.has(id),false,`sobra la columna ${id}`);
  assert.ok(cols.has('activation_km'));
});

test('Excel: Calle y Localidad de CABA ya no quedan vacías',()=>{
  const {cols}=loadExport([]);
  const r={origin_formatted_address:'Prelado Don Buenaventura Risso Patrón & Avenida Rivadavia, C1408 Cdad. Autónoma de Buenos Aires',destination:'Luis Braille 131, B1888 Florencio Varela, Provincia de Buenos Aires'};
  assert.deepEqual(['origin_street','origin_locality','origin_province'].map(id=>cols.get(id).value(r)),['Prelado Don Buenaventura Risso Patrón & Avenida Rivadavia','CABA','CABA']);
  assert.deepEqual(['destination_street','destination_locality','destination_province'].map(id=>cols.get(id).value(r)),['Luis Braille 131','Florencio Varela','Buenos Aires']);
});

test('Servicios y Facturación muestran los km con la regla de la prestadora',()=>{
  const services=read('operator-services.js'),billing=read('operator-billing.js'),params=read('company-billing-parameters-v4.js'),sql=read('supabase/migrations/20261031180000_company_km_rounding_modes_v1.sql');
  assert.match(services,/function serviceKm\(s\)/);
  assert.equal((services.match(/serviceKm\(s\)\.toLocaleString/g)||[]).length,2);
  assert.match(services,/auxilios:km-rounding-ready/);
  assert.match(billing,/kmText\(billedKm\(row\)\.total\)/);
  assert.match(billing,/auxilios:km-rounding-ready/);
  assert.match(params,/AuxiliosKmRounding\?\.reset\(\)/);
  assert.match(sql,/security definer/);
  assert.match(sql,/'administracion','operador','supervision','facturacion'/);
  assert.match(sql,/revoke all on function public\.list_company_km_rounding_v1\(\) from public,anon/);
});
