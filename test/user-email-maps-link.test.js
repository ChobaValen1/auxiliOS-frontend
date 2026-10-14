const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('la edición permite cambiar el email mediante el backend administrativo',()=>{
  const sigma=fs.readFileSync(path.join(root,'sigma.js'),'utf8');
  const edge=fs.readFileSync(path.join(root,'supabase','functions','auxilios-admin','index.ts'),'utf8');
  assert.match(sigma,/emailEl\.disabled = false/);
  assert.match(sigma,/ADMIN_API_BASE_URL\}\/api\/update-user/);
  assert.match(edge,/updateUserById\(userId, \{ email, email_confirm: true \}\)/);
  assert.match(edge,/\.from\("users"\)\.update\(\{/);
});

test('el mensaje compartido incluye el recorrido de Google Maps',()=>{
  const sigma=fs.readFileSync(path.join(root,'sigma.js'),'utf8');
  assert.match(sigma,/https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  assert.match(sigma,/Ver recorrido en Google Maps/);
  assert.match(sigma,/origin=\$\{encodeURIComponent\(origen\)\}/);
  assert.match(sigma,/destination=\$\{encodeURIComponent\(destino\)\}/);
});
