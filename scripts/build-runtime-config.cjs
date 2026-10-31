'use strict';
// Reescribe runtime-config.js con la base y la edición de la instalación que se publica.
// Sin variables AUXILIOS_* deja el archivo como está (instalación de Sigma).
// Solo acepta la llave publicable de Supabase: nunca una llave de servicio.
const fs=require('node:fs'),path=require('node:path');
const EDITIONS=['sigma','monogruero'];
function configuration(env){
  const url=String(env.AUXILIOS_SUPABASE_URL||'').trim(),key=String(env.AUXILIOS_SUPABASE_KEY||'').trim();
  const edition=String(env.AUXILIOS_EDITION||'').trim(),api=String(env.AUXILIOS_API_BASE_URL||'').trim();
  if(!url&&!key&&!edition&&!api)return null;
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url))throw new Error('AUXILIOS_SUPABASE_URL tiene que ser https://<proyecto>.supabase.co');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))throw new Error('AUXILIOS_SUPABASE_KEY tiene que ser la llave publicable (sb_publishable_…)');
  if(!EDITIONS.includes(edition))throw new Error('AUXILIOS_EDITION tiene que ser '+EDITIONS.join(' o '));
  if(api&&!/^https:\/\//.test(api))throw new Error('AUXILIOS_API_BASE_URL tiene que empezar con https://');
  // Soporte (opcional): WhatsApp con código de país, sin + ni espacios (ej.: 5491123456789), y email.
  const wa=String(env.AUXILIOS_SUPPORT_WHATSAPP||'').replace(/\D/g,''),mail=String(env.AUXILIOS_SUPPORT_EMAIL||'').trim();
  if(wa&&!/^\d{10,15}$/.test(wa))throw new Error('AUXILIOS_SUPPORT_WHATSAPP tiene que ser el número con código de país (10 a 15 números)');
  if(mail&&!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(mail))throw new Error('AUXILIOS_SUPPORT_EMAIL no es un email válido');
  return{edition,supabaseUrl:url,supabaseKey:key,apiBaseUrl:api,...(wa?{supportWhatsapp:wa}:{}),...(mail?{supportEmail:mail}:{})};
}
function render(c){return '/* Generado al publicar por scripts/build-runtime-config.cjs. */\nwindow.AUXILIOS_RUNTIME = Object.freeze('+JSON.stringify(c,null,2)+');\n';}
if(require.main===module){
  const c=configuration(process.env);
  if(c){fs.writeFileSync(path.join(__dirname,'../runtime-config.js'),render(c));console.log('Instalación «'+c.edition+'» configurada.');}
  else console.log('Sin variables AUXILIOS_*: queda la configuración de Sigma.');
}
module.exports={configuration,render};
