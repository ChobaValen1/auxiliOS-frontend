const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('company-documents.js','utf8');
function fixture(read){
  const calls=[],events=[],window={dispatchEvent:event=>events.push(event)};
  const context=vm.createContext({window,console,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},_db:{from:table=>({select:columns=>({eq:(key,value)=>({maybeSingle:()=>{calls.push({table,columns,key,value});return read(columns,calls.length);}})})})}});
  vm.runInContext(source,context);
  return{api:window.CompanyDocuments,calls,events};
}
test('organization identity reads the name only, deduplicates concurrent reads and returns no fiscal or signature data',async()=>{
  let release;
  const f=fixture(()=>new Promise(resolve=>release=resolve));
  const a=f.api.loadIdentity(),b=f.api.loadIdentity();assert.equal(a,b);
  release({data:{legal_name:'  Remolques Norte  ',tax_id:'not-for-sidebar',signature_image:'not-for-sidebar'}});
  const identity=await a;assert.equal(identity.legal_name,'Remolques Norte');assert.deepEqual(Object.keys(identity),['legal_name']);
  await f.api.loadIdentity();assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0],{table:'company_document_settings',columns:'legal_name',key:'id',value:true});
  assert.equal(f.events[0].type,'auxilios:organization-changed');assert.deepEqual(Object.keys(f.events[0].detail),['legal_name']);
});
test('a failed read can be retried and is not cached as an organization',async()=>{
  const f=fixture((_,n)=>Promise.resolve(n===1?{error:new Error('offline')}:{data:{legal_name:'Empresa disponible'}}));
  await assert.rejects(f.api.loadIdentity(),/offline/);
  assert.equal((await f.api.loadIdentity()).legal_name,'Empresa disponible');assert.equal(f.calls.length,2);
});
test('loading saved company settings updates the header identity without exposing other fields',async()=>{
  const f=fixture(columns=>Promise.resolve({data:{legal_name:columns==='*'?'Nombre actualizado':'Nombre anterior',tax_id:'private',representative:'private'}}));
  await f.api.loadIdentity();await f.api.load();
  const identity=await f.api.loadIdentity();assert.equal(identity.legal_name,'Nombre actualizado');assert.deepEqual(Object.keys(identity),['legal_name']);assert.equal(f.calls.length,2);
});
test('a delayed name request cannot overwrite a newer saved identity',async()=>{
  let release;
  const f=fixture(columns=>columns==='legal_name'?new Promise(resolve=>release=resolve):Promise.resolve({data:{legal_name:'Nombre vigente'}}));
  const pending=f.api.loadIdentity();await f.api.load();release({data:{legal_name:'Nombre obsoleto'}});
  assert.equal((await pending).legal_name,'Nombre vigente');assert.equal((await f.api.loadIdentity()).legal_name,'Nombre vigente');
});
