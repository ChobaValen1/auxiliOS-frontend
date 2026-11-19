const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const address=require('../address-parts-v1.js');

/* Exportador real con un maps-proxy falso que responde por placeId. */
function loadExport(answers={},store={}){
  const calls=[];
  const el=()=>({id:'',textContent:'',appendChild(){},remove(){}});
  const _db={functions:{invoke:async(name,{body})=>{calls.push(body);if(body.action==='autocomplete')return{data:{suggestions:answers.autocomplete?[{placeId:answers.autocomplete}]:[]}};const a=answers[body.placeId];if(a instanceof Error)return{error:a};return{data:a||{}}}}};
  const window={AuxiliosAddress:address,localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v}}};
  const document={readyState:'complete',getElementById:()=>null,createElement:el,head:{appendChild(){}},body:{appendChild(){}},querySelector:()=>null,addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'operator-billing-export.js'),'utf8'),{window,document,console,Intl,Date,Math,Number,String,Set,Map,JSON,Promise,setTimeout,clearTimeout,Error,Array,Object,encodeURIComponent,_db});
  const E=window.OperatorBillingExcel;
  return {E,calls,store,cols:new Map(E.serviceColumns.map(c=>[c.id,c]))};
}

test('el recorrido de Maps usa las coordenadas guardadas de origen y destino',()=>{
  const {E}=loadExport();
  const r={billing_base_latitude:'-34.67',billing_base_longitude:'-58.39',billing_route_mode:'base_origin_destination_base',
    origin_formatted_address:'Av. Gral. Paz 7051, B1675 Cdad. Autónoma de Buenos Aires',origin_lat:-34.6331,origin_lng:-58.5312,
    destination_formatted_address:'DEL CAZÓN 2198',destination_lat:-34.4251,destination_lng:-58.5796};
  const url=new URL(E.mapsRoute(r));
  assert.equal(url.searchParams.get('origin'),'-34.67,-58.39');
  assert.equal(url.searchParams.get('waypoints'),'-34.6331,-58.5312|-34.4251,-58.5796');
  assert.equal(url.searchParams.get('destination'),'-34.67,-58.39');
  // Sin coordenadas (dirección escrita a mano y nunca validada) queda el texto.
  const directo=new URL(E.mapsRoute({...r,billing_route_mode:'origin_destination',destination_lat:null,destination_lng:null}));
  assert.equal(directo.searchParams.get('origin'),'-34.6331,-58.5312');
  assert.equal(directo.searchParams.get('destination'),'DEL CAZÓN 2198');
  // Coordenadas 0,0 o vacías no cuentan como punto.
  assert.equal(new URL(E.mapsRoute({...r,billing_route_mode:'origin_destination',origin_lat:0,origin_lng:0})).searchParams.get('origin'),'Av. Gral. Paz 7051, B1675 Cdad. Autónoma de Buenos Aires');
});

test('localidad: la que trae la dirección se respeta y sin consultar a Google',async()=>{
  const {E,calls,cols}=loadExport();
  const r={service_id:1,origin_formatted_address:'Independencia 737, B1925 Ensenada, Provincia de Buenos Aires',origin_lat:-34.86,origin_lng:-57.9,destination_formatted_address:'Lavalle 1314, C1048AAH Cdad. Autónoma de Buenos Aires',destination_lat:-34.6,destination_lng:-58.38};
  const [out]=await E.attachLocalities([r],['origin','destination']);
  assert.equal(calls.length,0);
  assert.equal(cols.get('origin_locality').value(out),'Ensenada');
  assert.equal(cols.get('destination_locality').value(out),'CABA');
});

test('localidad vacía o genérica: se completa con la de Google para el punto, una sola vez por punto',async()=>{
  const store={};
  const answers={'coord:-35.01234,-58.12345':{locality:'Cañuelas',province:'Provincia de Buenos Aires'},'coord:-37.16234,-56.98765':{locality:'Villa Gesell',province:'Provincia de Buenos Aires'},'coord:-34.60123,-58.43123':{locality:'Buenos Aires',province:'Ciudad Autónoma de Buenos Aires'}};
  const {E,calls,cols}=loadExport(answers,store);
  const rows=[
    {service_id:1,origin_formatted_address:'RP6, Provincia de Buenos Aires',origin_lat:-35.01234,origin_lng:-58.12345,destination_formatted_address:'Av. 4 398, B7165 Ciudad Autónoma de Buenos Aires, Provincia de Buenos Aires',destination_lat:-37.16234,destination_lng:-56.98765},
    {service_id:2,origin_formatted_address:'RP6, Provincia de Buenos Aires',origin_lat:-35.01234,origin_lng:-58.12345,destination_formatted_address:'Larraya 4500, C1439 Comuna 8, Cdad. Autónoma de Buenos Aires',destination_lat:-34.60123,destination_lng:-58.43123},
  ];
  const out=await E.attachLocalities(rows,['origin','destination']);
  assert.equal(calls.filter(c=>c.action==='place').length,3);
  assert.equal(cols.get('origin_locality').value(out[0]),'Cañuelas');
  assert.equal(cols.get('origin_province').value(out[0]),'Buenos Aires');
  assert.equal(cols.get('destination_locality').value(out[0]),'Villa Gesell');
  assert.equal(cols.get('destination_locality').value(out[1]),'CABA');
  // Segunda exportación: sale del caché del navegador, sin llamar a Google.
  const again=loadExport(answers,store);
  const out2=await again.E.attachLocalities(rows,['origin']);
  assert.equal(again.calls.length,0);
  assert.equal(again.cols.get('origin_locality').value(out2[0]),'Cañuelas');
});

test('dirección escrita a mano sin coordenadas: se busca el texto; si Google falla el Excel sale igual',async()=>{
  const {E,cols}=loadExport({autocomplete:'abc',abc:{locality:'Valeria del Mar',province:'Provincia de Buenos Aires'}});
  const [out]=await E.attachLocalities([{service_id:1,origin:'rosales 2658 valeria del mar'}],['origin']);
  assert.equal(cols.get('origin_locality').value(out),'Valeria del Mar');
  const fail=loadExport({'coord:-35.00000,-58.00000':new Error('Google caído')});
  const [same]=await fail.E.attachLocalities([{service_id:1,origin_formatted_address:'RP2, Provincia de Buenos Aires',origin_lat:-35,origin_lng:-58}],['origin']);
  assert.equal(fail.cols.get('origin_locality').value(same),'');
  assert.equal(fail.cols.get('origin_province').value(same),'Buenos Aires');
  assert.equal(fail.store['auxilios.billing.excel.localities.v1'],undefined);
});
