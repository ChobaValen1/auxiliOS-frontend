const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('sigma.js','utf8');
function fn(name){const p=source.indexOf('function '+name+'(');assert.ok(p>=0);return (source.slice(p-6,p)==='async '?'async ':'')+source.slice(p,source.indexOf('\n}',p)+2);}
test('workshop buttons collapse to the selected type and reopen without losing the detail',()=>{
  const input={value:''},detail={value:'Trabajo realizado'};
  const buttons=['Mantenimiento','Preventivo','Repuestos'].map(type=>({dataset:{workshopType:type},setAttribute(k,v){this[k]=v;}}));
  const c=vm.createContext({document:{getElementById:id=>id==='cj-taller-tipo'?input:detail,querySelectorAll:()=>buttons},_TALLER_EJ:{}});
  vm.runInContext(['seleccionarTipoTaller','actualizarBotonesTaller','onTallerTipoChange'].map(fn).join('\n'),c);
  c.seleccionarTipoTaller('Preventivo');
  assert.equal(input.value,'Preventivo');assert.deepEqual(buttons.map(b=>b.hidden),[true,false,true]);
  c.seleccionarTipoTaller('Preventivo');
  assert.equal(input.value,'');assert.ok(buttons.every(b=>!b.hidden));assert.equal(detail.value,'Trabajo realizado');
  c.seleccionarTipoTaller('Repuestos');assert.equal(input.value,'Repuestos');
});
for(const uploadFails of [false,true])test('OCR failure retains '+(uploadFails?'the file for retry at save':'the uploaded photo for audit'),async()=>{
  const nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,{style:{},textContent:'',value:'',disabled:false});return nodes.get(id);};
  const file={name:'odometro.jpg'};
  const c=vm.createContext({document:{getElementById:get},navigator:{onLine:true},jornadaParaCerrar:{km_inicio:100},toast(){},console,
    subirFotoOdometro:async()=>{if(uploadFails)throw Error('offline');return 'https://example.test/photo.jpg';},
    llamarIA_Real:async()=>({success:false})});
  vm.runInContext('let fotoKmFinal=null,kmIaFinal=null,kmOrigenFinal=null;'+fn('procesarFotoConIA'),c);
  await c.procesarFotoConIA({target:{files:[file]}},'cierre');
  assert.equal(vm.runInContext('fotoKmFinal',c),uploadFails?file:'https://example.test/photo.jpg');
  assert.equal(vm.runInContext('kmOrigenFinal',c),'manual_ia_fallo');
  assert.equal(get('cj-km-manual-area').style.display,'block');
  assert.equal(get('btn-confirmar-cierre').disabled,false);
  assert.match(get('cj-foto-status').textContent,/No se pudo analizar/);
  assert.match(get('cj-foto-hint').textContent,/manualmente.*auditoría/);
});
