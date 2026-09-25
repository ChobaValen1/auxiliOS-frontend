const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('supabase.js','utf8');
const code=source.slice(source.indexOf('function _loginErrorMessage('),source.indexOf('// Nota: esta función no solo hace login'));
for(const [name,error,expected] of [
 ['credenciales inválidas',{code:'invalid_credentials',status:400},false],
 ['sin conexión',{code:'fetch_error',status:0},/conectar/],
 ['límite servidor',{code:'over_request_rate_limit',status:429},/limitó/],
 ['email sin confirmar',{code:'email_not_confirmed',status:400},/confirmar/],
 ['error servidor',{status:503},/conectar/],
 ['éxito',null,true]
])test('acceso: '+name,async()=>{
 let initialized=false;
 const context=vm.createContext({_db:{auth:{signInWithPassword:async()=>({error,data:{user:{id:'test'}}})}},console:{warn(){}},cargarPerfilUsuario:async()=>{},inicializarApp:async()=>{initialized=true;}});
 vm.runInContext(code,context);
 if(expected instanceof RegExp)await assert.rejects(context.loginUsuario('test@example.com','unused'),e=>e.loginMessage&&expected.test(e.message));
 else assert.equal(await context.loginUsuario('test@example.com','unused'),expected);
 assert.equal(initialized,!error);
});
