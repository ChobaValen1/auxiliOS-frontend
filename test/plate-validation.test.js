const {test}=require('node:test');
const assert=require('node:assert/strict');
const plate=require('../plate-validation.js');
test('accepts Argentine car and motorcycle formats, normalizing separators',()=>{
 for(const value of ['ABC123','AB123CD','123ABC','A123BCD','ab 123 cd','abc-123']) assert.equal(plate.valid(value),true,value);
 assert.equal(plate.normalize(' ab-123 cd '),'AB123CD');
});
test('rejects malformed and overlong plates without truncation',()=>{
 for(const value of ['',null,'ABC12','ABCDEFG','1234567','AB123CDE','AS12312131231321','AB!123CD','ÁB123CD']) assert.equal(plate.valid(value),false,String(value));
 assert.equal(plate.normalize('AB123CDE'),'AB123CDE');
});
