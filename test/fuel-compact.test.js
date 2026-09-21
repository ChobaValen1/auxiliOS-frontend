const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('sigma.js','utf8');function fn(n){const p=s.indexOf('function '+n+'(');return (s.slice(p-6,p)==='async '?'async ':'')+s.slice(p,s.indexOf('\n}',p)+2)}
function context(extra={}){const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',style:{},setAttribute(){}});return nodes.get(id)};const c=vm.createContext({document:{getElementById:get,querySelectorAll:()=>[],querySelector:()=>null},console:{error(){}},_actualizarEstadoConexion(){},...extra});vm.runInContext("let _fuelBusy='';"+fn('_setFuelBusy'),c);return {c,get}}
test('unreadable ticket releases controls and permits manual entry',async()=>{const {c,get}=context({FileReader:class{readAsDataURL(){this.onerror(Error('bad image'))}}});vm.runInContext(fn('leerTicketCombustible'),c);await c.leerTicketCombustible({files:[{}],value:'photo'});assert.equal(vm.runInContext('_fuelBusy',c),'');assert.match(get('cb-scan-status').textContent,/manualmente/)});
test('save failure releases busy state and blocks duplicate submissions',async()=>{let reject,calls=0,msg='';const {c,get}=context({_truckActual:{truck_id:1},_jornadasAbiertasCache:[],_jornadaActivaLocal:null,selectedPayMethod:'efectivo',selectedApp:'',_modalError:(_,v)=>msg=v,_resolverLogIdLocal:()=>{calls++;return new Promise((_,r)=>reject=r)}});for(const [id,v] of Object.entries({'cb-litros':'80','cb-precio':'1250','cb-fecha':'2026-09-14'}))get(id).value=v;vm.runInContext(fn('guardarCombustible'),c);const p=c.guardarCombustible();await c.guardarCombustible();assert.equal(calls,1);assert.equal(vm.runInContext('_fuelBusy',c),'save');reject(Error('network'));await p;assert.equal(vm.runInContext('_fuelBusy',c),'');assert.match(msg,/reintentá/)});


/* ── la carga se busca por jornada, no por camión + fecha ───────────────── */

test('el detalle de jornada y el de rendición buscan las cargas por log_id', () => {
  /* Filtrar por camión + fecha tira las cargas de una jornada que cruza la
     medianoche —el chofer carga después de las 00:00 y fuel_date queda en el
     día siguiente— y encima muestra la de la jornada anterior, que sí cae en
     esa fecha. Mal en las dos direcciones.

     Medido contra la base: de 170 cargas atadas a una jornada, 98 no se veían
     (57,6%, $12.147.614) y 81 eran por cruzar la medianoche. En la jornada del
     19/09 del AH232YY se mostraba una carga de $142.190 que era del 18/09 y se
     escondía la propia de $90.958.

     El log_id manda; camión + fecha queda de respaldo SÓLO para las huérfanas,
     que son las que se guardaron sin jornada y no tienen otro vínculo. */
  const supa = fs.readFileSync('supabase.js', 'utf8');
  const porJornada = supa.match(
    /\.or\(`log_id\.eq\.\$\{\w+\},and\(log_id\.is\.null,truck_id\.eq\.[^`]+`\)/g) || [];
  assert.equal(porJornada.length, 2,
    'las dos consultas por jornada (detalle de jornada y de rendición) tienen que ir por log_id, ' +
    `con camión + fecha sólo de respaldo; encontradas: ${porJornada.length}`);
  // Y ninguna de las dos puede volver al filtro plano por fecha de jornada.
  assert.doesNotMatch(supa, /\.eq\('fuel_date', log\.log_date\)/);
  assert.doesNotMatch(supa, /\.eq\('fuel_date', jornada\.log_date\)/);
});
