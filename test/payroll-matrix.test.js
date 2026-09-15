const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('payroll-matrix.js','utf8'),context);const m=context.window.PayrollMatrix;
test('monthly bonus independent of activity and real km basis',()=>{const r=m.calculate({bonuses:[{name:'Mensual',amount:'280.000'}]}, {},123);assert.equal(r.km,123);assert.equal(r.bonus,280000);assert.equal(r.commission,0);});
test('billed km and independent fixed/percentage commissions',()=>{const r=m.calculate({km_basis:'billed',commissions:[{concept_id:'battery',source:'extras',mode:'fixed',value:2000},{concept_id:'tow',source:'invoices',mode:'percent',value:10}]},{invoices:[{id:'i',concept_id:'tow',km:50.5,amount:50000,currency:'ARS',quantity:1}],extras:[{id:'e',concept_id:'battery',quantity:2}]},999);assert.equal(r.km,50.5);assert.equal(r.commission,9000);assert.equal(r.snapshot.commission_details[0].records[0],'e');});
test('missing billed distance stops calculation',()=>assert.throws(()=>m.calculate({km_basis:'billed'},{invoices:[{km:null}]},999),/desglose/));
test('invalid commissions do not generate misleading amounts',()=>{assert.throws(()=>m.normalize({commissions:[{concept_id:'a',source:'extras',mode:'percent',value:101}]}),/100/);assert.throws(()=>m.calculate({commissions:[{concept_id:'a',source:'extras',mode:'percent',value:10}]},{extras:[{concept_id:'a',amount:100,currency:'USD'}]},0),/ARS/);});
test('receipt escapes user-supplied bonus labels',()=>{assert.match(m.receiptHtml({compensation_snapshot:{km_basis:'real',bonuses:[{name:'<script>',amount:1}]}}),/&lt;script&gt;/);});
