const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('payroll-matrix.js','utf8'),context);const m=context.window.PayrollMatrix;
test('monthly bonus independent of activity and real km basis',()=>{const r=m.calculate({bonuses:[{name:'Mensual',amount:'280.000'}]}, {},123);assert.equal(r.km,123);assert.equal(r.bonus,280000);assert.equal(r.commission,0);});
test('billed km and independent fixed/percentage commissions',()=>{const r=m.calculate({km_basis:'billed',commissions:[{concept_id:'battery',source:'extras',mode:'fixed',value:2000},{concept_id:'tow',source:'invoices',mode:'percent',value:10}]},{invoices:[{id:'i',concept_id:'tow',km:50.5,amount:50000,currency:'ARS',quantity:1}],extras:[{id:'e',concept_id:'battery',quantity:2}]},999);assert.equal(r.km,999);assert.equal(r.commission,9000);assert.equal(r.snapshot.commission_details[0].records[0],'e');});
test('service billing distances never determine salary km',()=>assert.equal(m.calculate({km_basis:'billed'},{invoices:[{km:null}]},999).km,999));
test('invalid commissions do not generate misleading amounts',()=>{assert.throws(()=>m.normalize({commissions:[{concept_id:'a',source:'extras',mode:'percent',value:101}]}),/100/);assert.throws(()=>m.calculate({commissions:[{concept_id:'a',source:'extras',mode:'percent',value:10}]},{extras:[{concept_id:'a',amount:100,currency:'USD'}]},0),/ARS/);});
test('receipt escapes user-supplied bonus labels',()=>{assert.match(m.receiptHtml({compensation_snapshot:{km_basis:'real',bonuses:[{name:'<script>',amount:1}]}}),/&lt;script&gt;/);});

test('journey odometers define payable kilometers',()=>{assert.equal(m.journeyKm({status:'closed',km_inicio:1000,km_final:1180}),180);assert.equal(m.journeyKm({status:'open',km_inicio:1000}),null);assert.throws(()=>m.journeyKm({status:'closed',km_inicio:1000,km_final:900}),/odómetros/);assert.throws(()=>m.journeyKm({status:'closed',km_inicio:null,km_final:900}),/odómetros/);});
