// AuxiliOS · registro e ingreso, alta inicial, Inicio con los tres números y Prestadoras con sus tarifas.
// Todo se guarda en las tablas solo_* de la base de la instalación; cada gruero ve solo lo suyo (reglas de la base).
(function(){
'use strict';
const app=document.getElementById('app');
const RT=window.AUXILIOS_RUNTIME||{};
const TERMS_VERSION='2026-10-31';
const needsTerms=()=>!!user&&user.user_metadata?.terms_version!==TERMS_VERSION;
let db=null, user=null, profile=null, view='inicio', month=startOfMonth(new Date()), detailId=null;
let recovering=false, authNotice=null, authEmail='';
const DEFAULT_TYPES=['Remolque','Auxilio mecánico','Traslado'];
const icon=(n,c)=>`<svg class="ico${c?' '+c:''}" aria-hidden="true"><use href="/ui/icons.svg#${n}"/></svg>`;
// Las pantallas de servicios, remito y gastos viven en solo-ops.js y se registran acá.
const views={};

function startOfMonth(d){return new Date(d.getFullYear(),d.getMonth(),1);}
function isoDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$ '+Math.round(Number(n)||0).toLocaleString('es-AR');
const monthName=d=>d.toLocaleDateString('es-AR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true;},2600);}
function errText(e){const m=String(e?.message||e||'');
  if(/Invalid login/i.test(m))return 'El email o la contraseña no coinciden.';
  if(/already registered|already been registered/i.test(m))return 'Ese email ya tiene una cuenta. Entrá con tu contraseña.';
  if(/Password should be/i.test(m))return 'La contraseña tiene que tener al menos 6 caracteres.';
  if(/Email not confirmed/i.test(m))return 'Falta confirmar tu email: revisá tu correo y tocá el enlace.';
  if(/duplicate key|solo_clients_owner_name|solo_service_types_owner_name/i.test(m))return 'Ya existe uno con ese nombre.';
  if(/rate limit|only request this after|security purposes/i.test(m))return 'Ya te mandamos un email hace poco. Esperá un minuto y probá de nuevo.';
  if(/should be different/i.test(m))return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if(/invalid format|Unable to validate email/i.test(m))return 'Revisá el email: tiene que ser como nombre@correo.com.';
  if(/Failed to fetch|NetworkError|Load failed/i.test(m))return 'No hay conexión. Revisá la señal y probá de nuevo.';
  return m||'No se pudo completar. Probá de nuevo.';}
function num(v){const n=Number(String(v??'').replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:0;}

/* ── Arranque ─────────────────────────────────────────── */
function start(){
  if(!window.supabase||!RT.supabaseUrl){app.innerHTML='<div class="empty">No se pudo conectar. Revisá tu conexión y recargá.</div>';return;}
  readAuthHash();
  // Con la capa sin señal, todas las consultas pasan por su fetch (copia local + cola de cambios).
  const off=window.SoloOffline;
  db=off?window.supabase.createClient(RT.supabaseUrl,RT.supabaseKey,{global:{fetch:off.fetch}}):window.supabase.createClient(RT.supabaseUrl,RT.supabaseKey);
  off?.attach(db,RT.supabaseUrl);
  addEventListener('solo-synced',()=>{if(user&&profile)go(/=/.test(location.hash)?'inicio':location.hash.slice(1)||'inicio',true);});
  db.auth.onAuthStateChange((event,session)=>{const u=session?.user||null;
    if(event==='PASSWORD_RECOVERY'){recovering=true;user=u;return renderNewPassword();}
    if((u?.id||null)!==(user?.id||null)){user=u;boot();}});
  db.auth.getSession().then(({data})=>{user=data.session?.user||null;boot();});
}
async function boot(){
  if(recovering&&user)return renderNewPassword();
  if(window.SoloOffline)await window.SoloOffline.setUser(user?.id||null);
  if(!user){profile=null;return renderAuth(authStartMode());}
  if(/(^|&)alta=1/.test(location.search.slice(1)))syncAuthUrl('login'); // ya entró: al cerrar sesión vuelve a Ingresar
  const {data,error}=await db.from('solo_profiles').select('*').eq('owner_id',user.id).maybeSingle();
  if(error){app.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  profile=data;
  if(!profile)return renderOnboarding(1);
  // Al volver de un enlace del email el hash trae datos de la sesión: se arranca en Inicio.
  go(/=/.test(location.hash)?'inicio':location.hash.slice(1)||'inicio');
}
window.addEventListener('hashchange',()=>{if(user&&profile)go(location.hash.slice(1)||'inicio',true);});
function go(name,fromHash){
  const i=String(name).indexOf('-'),v=i<0?String(name):String(name).slice(0,i),id=i<0?null:String(name).slice(i+1);
  view=['inicio','mas','clientes','cliente'].includes(v)||views[v]?v:'inicio';detailId=id||null;
  if(!fromHash){const h=detailId?view+'-'+detailId:view;if(location.hash.slice(1)!==h)history.replaceState(null,'','#'+h);}
  render();
}

/* ── Registro e ingreso ───────────────────────────────── */
// Los enlaces de los emails (confirmar cuenta, nueva contraseña) vuelven siempre a esta app.
const backUrl=()=>location.origin+'/solo.html';
// «Probala gratis» abre en Crear cuenta (?alta=1); «Ingresar» y los enlaces de los emails abren en Ingresar.
const authStartMode=()=>/(^|&)alta=1(&|$)/.test(location.search.slice(1))?'signup':'login';
// La URL sigue a la pestaña: si recarga o vuelve atrás, queda donde estaba.
function syncAuthUrl(mode){try{const q=new URLSearchParams(location.search);if(mode==='signup')q.set('alta','1');else q.delete('alta');
  const s=q.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:'')+location.hash);}catch(x){}}
// Errores de tipeo comunes en el dominio del email.
const MAIL_FIX={'gmial.com':'gmail.com','gmai.com':'gmail.com','gmal.com':'gmail.com','gamil.com':'gmail.com','gmail.co':'gmail.com','gmail.con':'gmail.com','gmail.com.ar':'gmail.com',
  'hotmial.com':'hotmail.com','hotmai.com':'hotmail.com','hotmal.com':'hotmail.com','hotmail.con':'hotmail.com','hotmail.co':'hotmail.com',
  'outlok.com':'outlook.com','outloo.com':'outlook.com','yaho.com':'yahoo.com','yahoo.com.ar.com':'yahoo.com.ar','yahoo.con':'yahoo.com'};
const mailSuggest=e=>{const m=/^([^@\s]+)@([^@\s]+)$/.exec(String(e||'').trim().toLowerCase());return m&&MAIL_FIX[m[2]]?m[1]+'@'+MAIL_FIX[m[2]]:null;};
// En «Revisá tu email»: botón directo a la casilla según el dominio.
const mailApp=e=>{const d=String(e||'').split('@')[1]?.toLowerCase()||'';
  if(/^(gmail|googlemail)\./.test(d))return{name:'Gmail',url:'https://mail.google.com/mail/u/0/#search/AuxiliOS'};
  if(/^(hotmail|outlook|live|msn)\./.test(d))return{name:'Outlook',url:'https://outlook.live.com/mail/0/'};
  if(/^yahoo\./.test(d))return{name:'Yahoo Mail',url:'https://mail.yahoo.com/'};return null;};
function readAuthHash(){
  const h=location.hash.slice(1),qs=location.search.slice(1);
  if(!/(^|&)(error|access_token|type)=/.test(h)&&!/(^|&)error=/.test(qs))return;
  const q=new URLSearchParams(/(^|&)error=/.test(qs)?qs:h);
  if(q.get('type')==='recovery')recovering=true;
  if(q.get('error')||q.get('error_code')){
    const why=(q.get('error')||'')+' '+(q.get('error_code')||'')+' '+(q.get('error_description')||'');
    authNotice=/access_denied|cancel/i.test(why)&&!/otp|email/i.test(why)?'Cancelaste el ingreso con Google. Probá de nuevo o entrá con tu email.'
      :/provider|oauth|google/i.test(why)?'No pudimos entrar con Google. Probá de nuevo o entrá con tu email.'
      :/expired|invalid/i.test(why)?'El enlace del email venció o ya se usó. Pedí uno nuevo.':'No pudimos validar el enlace del email. Pedí uno nuevo.';
    history.replaceState(null,'',location.pathname);
  }
}
// Ingreso con Google: el botón aparece solo si Google está activado en la base (así nunca queda un botón roto).
let googleOn=null;
const googleEnabled=()=>googleOn||(googleOn=fetch(RT.supabaseUrl+'/auth/v1/settings',{headers:{apikey:RT.supabaseKey}}).then(r=>r.ok?r.json():{}).then(j=>!!j?.external?.google).catch(()=>false));
const GOOGLE_G='<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
function screen(html){app.classList.add('bare');app.innerHTML=html;}
const passField=(id,label,auto,help)=>`<div class="field"><label for="${id}">${label}</label><div class="pass"><input id="${id}" type="password" autocomplete="${auto}" minlength="6" required autocapitalize="none" spellcheck="false"><button class="eye" type="button" data-eye="${id}" aria-label="Mostrar contraseña" aria-pressed="false">${icon('eye')}</button></div>${help?'<span class="help">'+help+'</span>':''}</div>`;
// Ojito: muestra u oculta la contraseña sin perder el cursor.
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-eye]');if(!b)return;const inp=document.getElementById(b.dataset.eye);if(!inp)return;
  const show=inp.type==='password';const pos=inp.selectionStart;inp.type=show?'text':'password';
  b.setAttribute('aria-pressed',String(show));b.setAttribute('aria-label',show?'Ocultar contraseña':'Mostrar contraseña');b.innerHTML=icon(show?'eye-off':'eye');
  inp.focus({preventScroll:true});try{inp.setSelectionRange(pos,pos);}catch(x){}});

function renderAuth(mode){
  const signup=mode==='signup',reset=mode==='reset';
  const title=signup?'Creá tu cuenta gratis':reset?'Recuperá tu contraseña':'Hola de nuevo';
  const sub=signup?'En un minuto tenés tu grúa cargada.':reset?'Te mandamos un enlace a tu email para elegir una contraseña nueva.':'Entrá para ver tus servicios, gastos y cuentas del mes.';
  const cta=signup?'Crear cuenta gratis':reset?'Mandarme el enlace':'Ingresar';
  // En compu, a la izquierda va qué es la app; en el celular solo el formulario.
  screen(`<div class="view auth auth2">
    <aside class="auth-aside" aria-hidden="true">
      <div class="auth-brand"><img src="/assets/icons/icon-192.png" alt="" width="52" height="52"><div class="brand">Auxili<b>OS</b></div></div>
      <h2>El control de tu grúa, <em>en una app.</em></h2>
      <ul class="auth-points"><li>${icon('check')}Servicios por prestadora, con la tarifa que se calcula sola</li><li>${icon('check')}Gastos y lo que te queda en el mes</li><li>${icon('check')}Remitos con fotos y firma, por WhatsApp</li></ul>
      <div class="auth-shot"><img src="/assets/solo-landing/inicio.jpg" alt="" width="390" height="844" loading="lazy"></div>
    </aside>
    <div class="auth-main">
    <div class="auth-brand auth-brand-m"><img src="/assets/icons/icon-192.png" alt="" width="44" height="44"><div class="brand">Auxili<b>OS</b></div></div>
    ${reset?'':`<div class="auth-tabs" role="tablist" aria-label="Ingresar o crear cuenta">
      <button type="button" role="tab" aria-selected="${!signup}" ${signup?'id="a-switch"':'tabindex="-1"'}>Ingresar</button>
      <button type="button" role="tab" aria-selected="${signup}" ${signup?'tabindex="-1"':'id="a-switch"'}>Crear cuenta</button></div>`}
    <div class="auth-head"><h1>${title}</h1><p class="sub">${sub}</p></div>
    ${authNotice?`<p class="notice" role="alert">${icon('circle-alert')}<span>${esc(authNotice)}</span></p>`:''}
    ${reset?'':`<div class="google-wrap" id="g-wrap" hidden><button class="btn block google-btn" type="button" id="a-google">${GOOGLE_G}<span>${signup?'Crear cuenta con Google':'Ingresar con Google'}</span></button><div class="or"><span>o con tu email</span></div></div>`}
    <form id="auth" class="card" novalidate>
      ${signup?'<div class="field"><label for="a-name">Tu nombre</label><input id="a-name" autocomplete="name" required></div>':''}
      <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required value="${esc(authEmail)}"><span class="help" id="a-fix" hidden></span></div>
      ${reset?'':passField('a-pass','Contraseña',signup?'new-password':'current-password',signup?'Al menos 6 caracteres.':'')}
      ${reset?'':'<p class="caps-warn" id="a-caps" hidden>'+icon('circle-alert')+'Tenés las mayúsculas activadas.</p>'}
      ${signup?`<label class="terms" for="a-terms"><input type="checkbox" id="a-terms"><span>Acepto los <a href="/terminos-solo.html" target="_blank" rel="noopener">Términos y condiciones</a> y la <a href="/terminos-solo.html#privacidad" target="_blank" rel="noopener">Política de privacidad</a>.</span></label>`:''}
      <p id="a-err" class="err" hidden></p>
      <button class="btn pri block" type="submit">${cta}</button>
      ${!signup&&!reset?'<button class="link center" id="a-forgot" type="button">¿Olvidaste tu contraseña?</button>':''}
      ${signup?`<p class="auth-free">${icon('circle-check')}Gratis en la etapa de prueba · sin tarjeta</p>`:''}
    </form>
    ${reset?'<p class="sub center">¿Te acordaste? <button class="link" id="a-switch" type="button">Ingresá</button></p>'
      :`<p class="sub center auth-alt">${signup?'¿Ya tenés cuenta?':'¿Todavía no tenés cuenta?'} <button class="link" id="a-alt" type="button">${signup?'Ingresá':'Creala gratis'}</button></p>`}
    <button class="link center help-link" type="button" id="a-help">${icon('life-buoy')} ¿Necesitás ayuda? Escribinos</button>
    </div>
  </div>`);
  authNotice=null;
  if(!reset)syncAuthUrl(mode);
  const $=x=>document.getElementById(x),er=$('a-err');
  const other=()=>{authEmail=$('a-email').value.trim();renderAuth(signup?'login':reset?'login':'signup');};
  $('a-switch').onclick=other;$('a-alt')?.addEventListener('click',other);
  // En compu el cursor arranca en el primer campo; en el celular no, para no tapar la pantalla con el teclado.
  if(matchMedia('(hover:hover) and (pointer:fine)').matches)(signup?$('a-name'):$('a-email').value?$('a-pass'):$('a-email'))?.focus({preventScroll:true});
  const fix=$('a-fix'),checkMail=()=>{const g=mailSuggest($('a-email').value);if(!fix)return;fix.hidden=!g;
    if(g){fix.innerHTML='¿Quisiste decir <button class="link" type="button" id="a-fixit">'+esc(g)+'</button>?';$('a-fixit').onclick=()=>{$('a-email').value=g;fix.hidden=true;$('a-pass')?.focus();};}};
  $('a-email').addEventListener('blur',checkMail);
  const caps=$('a-caps');$('a-pass')?.addEventListener('keyup',e=>{if(caps&&e.getModifierState)caps.hidden=!e.getModifierState('CapsLock');});
  $('a-pass')?.addEventListener('blur',()=>{if(caps)caps.hidden=true;});
  $('a-forgot')?.addEventListener('click',()=>{authEmail=$('a-email').value.trim();renderAuth('reset');});
  $('a-help').onclick=()=>support(signup?'No puedo crear la cuenta':'No puedo entrar',$('a-email').value.trim());
  if(!reset)googleEnabled().then(on=>{const w=$('g-wrap');if(w&&on)w.hidden=false;});
  $('a-google')?.addEventListener('click',async()=>{const b=$('a-google');if(b.disabled)return;
    if(!navigator.onLine)return fail('Sin señal no se puede entrar con Google. Probá cuando vuelva la conexión.');
    b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span>Abriendo Google…';
    const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:backUrl(),queryParams:{prompt:'select_account'}}});
    if(error){fail('No pudimos abrir Google. Probá de nuevo o entrá con tu email.');b.disabled=false;b.innerHTML=GOOGLE_G+'<span>'+(signup?'Crear cuenta con Google':'Ingresar con Google')+'</span>';}});
  const fail=(msg,resend)=>{er.innerHTML=esc(msg)+(resend?' <button class="link" type="button" id="a-resend">Reenviar email</button>':'');er.hidden=false;
    $('a-resend')?.addEventListener('click',()=>renderCheckEmail(authEmail,'signup',true));};
  $('auth').onsubmit=async e=>{
    e.preventDefault();const b=e.target.querySelector('button[type=submit]');er.hidden=true;
    const email=$('a-email').value.trim(),password=$('a-pass')?.value||'';authEmail=email;
    if(!email||(!reset&&password.length<6))return fail('Completá el email'+(reset?'.':' y una contraseña de al menos 6 caracteres.'));
    if(signup&&!$('a-terms').checked){$('a-terms').closest('.terms').classList.add('need');return fail('Para crear la cuenta tenés que aceptar los Términos y la Política de privacidad.');}
    b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span>'+(signup?'Creando…':reset?'Mandando…':'Entrando…');
    try{
      if(reset){const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:backUrl()});if(error)throw error;return renderCheckEmail(email,'reset');}
      if(signup){
        const name=$('a-name').value.trim();
        // Queda registrado qué versión de los términos aceptó y cuándo.
        const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name:name,terms_version:TERMS_VERSION,terms_accepted_at:new Date().toISOString()},emailRedirectTo:backUrl()}});
        if(error)throw error;
        // Supabase no avisa con error cuando el email ya existe: devuelve un usuario sin identidades.
        if(data.user&&Array.isArray(data.user.identities)&&!data.user.identities.length){authNotice='Ese email ya tiene una cuenta. Ingresá con tu contraseña.';return renderAuth('login');}
        if(!data.session)return renderCheckEmail(email,'signup');
      }else{const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error;}
    }catch(x){if(signup&&/already registered|already been registered/i.test(String(x?.message||''))){authNotice='Ese email ya tiene una cuenta. Ingresá con tu contraseña.';return renderAuth('login');}
      fail(errText(x),/Email not confirmed/i.test(String(x?.message||'')));b.disabled=false;b.textContent=cta;}
  };
}
// Pantalla de «revisá tu email», con reenvío (una vez por minuto, como pide Supabase).
function renderCheckEmail(email,kind,sendNow){
  const reset=kind==='reset';
  screen(`<div class="view auth">
    <div class="auth-brand"><img src="/assets/icons/icon-192.png" alt="" width="52" height="52"><div class="brand">Auxili<b>OS</b></div></div>
    <div class="mail-ico" aria-hidden="true">${icon('circle-check')}</div>
    <h1>Revisá tu email</h1>
    <p class="sub">Te mandamos un enlace a <b>${esc(email)}</b>. ${reset?'Tocalo para elegir una contraseña nueva.':'Tocalo para confirmar tu cuenta: se abre AuxiliOS y ya entrás.'}</p>
    <p class="hint">¿No te llegó? Mirá en Spam o Promociones. Puede tardar un par de minutos.</p>
    <p id="a-err" class="err" hidden></p>
    ${mailApp(email)?`<a class="btn pri block" id="open-mail" href="${mailApp(email).url}" target="_blank" rel="noopener">Abrir ${mailApp(email).name}</a>`:''}
    <button class="btn block" type="button" id="resend">Reenviar email</button>
    <button class="btn ghost block" type="button" id="back">Ir a Ingresar</button>
  </div>`);
  const $=x=>document.getElementById(x),b=$('resend'),er=$('a-err');
  $('back').onclick=()=>{authEmail=email;renderAuth('login');};
  const wait=s=>{b.disabled=true;const tick=()=>{if(!document.body.contains(b))return;if(s<=0){b.disabled=false;b.textContent='Reenviar email';return;}b.textContent='Reenviar en '+s+' s';s--;setTimeout(tick,1000);};tick();};
  const send=async()=>{er.hidden=true;b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span>Mandando…';
    const {error}=reset?await db.auth.resetPasswordForEmail(email,{redirectTo:backUrl()}):await db.auth.resend({type:'signup',email,options:{emailRedirectTo:backUrl()}});
    if(error){er.textContent=errText(error);er.hidden=false;b.disabled=false;b.textContent='Reenviar email';return;}
    toast('Email enviado');wait(60);};
  b.onclick=send;
  if(sendNow)send();else wait(60);
}
// Viene del enlace «nueva contraseña»: la sesión ya está abierta, falta elegir la clave.
function renderNewPassword(){
  screen(`<div class="view auth">
    <div class="auth-brand"><img src="/assets/icons/icon-192.png" alt="" width="52" height="52"><div class="brand">Auxili<b>OS</b></div></div>
    <h1>Elegí tu contraseña nueva</h1><p class="sub">${esc(user?.email||'')}</p>
    <form id="auth" class="card" novalidate>${passField('a-pass','Contraseña nueva','new-password','Al menos 6 caracteres.')}
      <p id="a-err" class="err" hidden></p><button class="btn pri block" type="submit">Guardar y entrar</button></form>
  </div>`);
  const er=document.getElementById('a-err');
  document.getElementById('auth').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');er.hidden=true;
    const password=document.getElementById('a-pass').value;if(password.length<6){er.textContent='La contraseña tiene que tener al menos 6 caracteres.';er.hidden=false;return;}
    b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span>Guardando…';
    const {error}=await db.auth.updateUser({password});
    if(error){er.textContent=errText(error);er.hidden=false;b.disabled=false;b.textContent='Guardar y entrar';return;}
    recovering=false;history.replaceState(null,'',location.pathname);toast('Contraseña actualizada');boot();};
}

/* ── Alta inicial: vos → tu trabajo → cómo trabajás hoy → tu grúa ── */
// Lo que se responde queda en el celular hasta terminar: si cierra la app a mitad, sigue donde estaba.
const ONB_STEPS=4;
function stepsBar(n){return '<div class="steps" aria-label="Paso '+n+' de '+ONB_STEPS+'">'+Array.from({length:ONB_STEPS},(_,i)=>'<i class="'+(i<n?'on':'')+'"></i>').join('')+'</div>';}
const PROVINCES=['Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán'];
const ONB_Q={
  fleet:{label:'¿Cuántas grúas tenés?',opts:[['1','1'],['2','2'],['3-5','3 a 5'],['6+','6 o más']]},
  types:{label:'¿Qué tipo de grúa?',multi:true,opts:[['plancha','Plancha'],['arrastre','Arrastre / pluma'],['pesada','Pesada'],['utilitario','Auxilio mecánico']]},
  drivers:{label:'¿Quién maneja?',opts:[['solo','Yo solo'],['con_choferes','Yo y choferes'],['solo_choferes','Solo choferes']]},
  years:{label:'¿Hace cuánto sos gruero?',opts:[['<1','Menos de 1 año'],['1-3','1 a 3 años'],['3-10','3 a 10 años'],['10+','Más de 10']]},
  monthly:{label:'¿Cuántos servicios hacés por mes?',opts:[['<20','Menos de 20'],['20-50','20 a 50'],['50-100','50 a 100'],['100+','Más de 100']]},
  providers:{label:'¿Con quién trabajás?',hint:'Las que marques quedan cargadas como tus prestadoras.',multi:true,opts:[['IKE','IKE'],['Addiuva','Addiuva'],['Cardinal','Cardinal'],['SOS','SOS'],['Europ Assistance','Europ Assistance'],['Mapfre','Mapfre'],['ACA','ACA'],['Particulares','Particulares'],['otra','Otra']]},
  tools:{label:'¿Cómo llevás las cuentas hoy?',multi:true,opts:[['cuaderno','Cuaderno'],['excel','Excel'],['otra_app','Otra app'],['whatsapp','WhatsApp / fotos'],['nada','No las llevo']]},
  pains:{label:'¿Qué es lo que más te cuesta?',multi:true,opts:[['ganancia','Saber cuánto gano'],['cobrar','Cobrarle a las prestadoras'],['remitos','Hacer los remitos'],['gastos','Controlar los gastos'],['facturar','Facturar']]},
  heard:{label:'¿Cómo nos conociste?',multi:true,opts:[['facebook','Facebook'],['instagram','Instagram'],['tiktok','TikTok'],['google','Google'],['otro_gruero','Otro gruero'],['prestadora','Una prestadora'],['otro','Otro']]}
};
// Marcas y modelos más usados para grúas en Argentina. «Otra» / «Otro» deja escribirlo.
const TRUCKS={'Iveco':['Daily','Tector','Eurocargo','Stralis','Trakker'],'Mercedes-Benz':['Sprinter','Accelo','Atego','Axor','Actros','710','1114','1620'],
  'Ford':['Cargo 816','Cargo 1119','Cargo 1723','F-4000','F-350','F-100','Ranger'],'Volkswagen':['Delivery','Worker','Constellation','Amarok'],
  'Agrale':['8700','10000','MA 9.2','Marruá'],'Hyundai':['HD 65','HD 78','HD 120'],'Isuzu':['NPR','NKR','NQR'],'JAC':['1040','1063','1083'],'Foton':['Aumark','Tunland'],
  'Renault':['Master','Midlum'],'Fiat':['Ducato','Iveco 150'],'Peugeot':['Boxer'],'Toyota':['Hilux','Dyna'],'Chevrolet':['NPR','S10','C-10'],'Scania':['P','G','R'],'Volvo':['FM','FH','VM']};
const OTHER='__otra__';
const ONB_REQ={2:['fleet','types','drivers','years','monthly'],3:['providers','tools','heard']};
let onb={};
const onbKey=()=>'solo-onb-v2:'+(user?.id||'');
function onbLoad(){try{onb=JSON.parse(localStorage.getItem(onbKey())||'{}')||{};}catch(x){onb={};}}
function onbSave(){try{localStorage.setItem(onbKey(),JSON.stringify(onb));}catch(x){}}
// WhatsApp argentino: código de área + número (10 dígitos), sin 0 ni 15. Se guarda como +549…
function waNormalize(v){let d=String(v||'').replace(/\D/g,'');if(d.startsWith('54'))d=d.slice(2);if(d.startsWith('9')&&d.length===11)d=d.slice(1);if(d.startsWith('0'))d=d.slice(1);
  // 11 15 2345 6789 → quita el 15 que va después del código de área (2 a 4 dígitos).
  if(d.length===12){for(const a of [2,3,4])if(d.slice(a,a+2)==='15'){d=d.slice(0,a)+d.slice(a+2);break;}}
  return d.length===10?'+549'+d:null;}
const chipsQ=k=>{const q=ONB_Q[k],v=onb[k];const on=x=>q.multi?(v||[]).includes(x):v===x;
  return `<fieldset class="q" data-q="${k}"><legend>${q.label}</legend>${q.multi||q.hint?`<p class="q-hint">${[q.multi?'Podés marcar varias.':'',q.hint||''].filter(Boolean).join(' ')}</p>`:''}<div class="chips">${q.opts.map(([val,l])=>`<button type="button" class="chip" data-v="${esc(val)}" aria-pressed="${on(val)}">${esc(l)}</button>`).join('')}</div></fieldset>`;};
function renderOnboarding(step){
  if(step===1&&!onb._loaded){onbLoad();onb._loaded=true;if(onb.step>1&&onb.step<=ONB_STEPS)step=onb.step;}
  onb.step=step;onbSave();
  const metaName=user?.user_metadata?.full_name||user?.user_metadata?.name||'';
  const body={
    1:`<h1>Bienvenido</h1><p class="sub">Contanos quién sos. Tu nombre y tu WhatsApp salen en los remitos.</p>
      <div class="frm"><div class="field"><label for="o-name">Nombre y apellido</label><input id="o-name" autocomplete="name" value="${esc(onb.name||metaName)}" required></div>
        <div class="field"><label for="o-phone">WhatsApp</label><input id="o-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="11 2345 6789" value="${esc(onb.phoneRaw||'')}" required><span class="help">Con código de área, sin 0 ni 15.</span></div>
        <div class="field"><label for="o-biz">Nombre comercial<small>opcional</small></label><input id="o-biz" placeholder="Grúas Pérez" value="${esc(onb.biz||'')}"></div>
        <div class="row2"><div class="field"><label for="o-prov">Provincia</label><select id="o-prov" required><option value="">Elegí…</option>${PROVINCES.map(p=>`<option ${onb.province===p?'selected':''}>${p}</option>`).join('')}</select></div>
        <div class="field"><label for="o-city">Localidad</label><input id="o-city" autocomplete="address-level2" placeholder="Pilar" value="${esc(onb.city||'')}" required></div></div></div>
      ${needsTerms()?`<label class="terms" for="o-terms"><input type="checkbox" id="o-terms"><span>Acepto los <a href="/terminos-solo.html" target="_blank" rel="noopener">Términos y condiciones</a> y la <a href="/terminos-solo.html#privacidad" target="_blank" rel="noopener">Política de privacidad</a>.</span></label>`:''}`,
    2:`<h1>Tu trabajo</h1><p class="sub">Así armamos la app a tu medida. Tocá una opción en cada una.</p><div class="frm">${ONB_REQ[2].map(chipsQ).join('')}</div>`,
    3:`<h1>Cómo trabajás hoy</h1><p class="sub">Nos ayuda a mejorar AuxiliOS para vos.</p><div class="frm">${chipsQ('providers')}
        <div class="field" id="o-other-wrap" ${(onb.providers||[]).includes('otra')?'':'hidden'}><label for="o-other">¿Cuál otra?</label><input id="o-other" placeholder="Nombre de la prestadora" value="${esc(onb.providersOther||'')}"></div>
        ${chipsQ('tools')}${chipsQ('pains')}${chipsQ('heard')}</div>`,
    4:`<h1>Tu grúa</h1><p class="sub">La patente sale en cada remito.</p>
      <div class="frm"><div class="field"><label for="o-plate">Patente</label><input id="o-plate" autocapitalize="characters" placeholder="AB 123 CD" value="${esc(onb.plate||'')}" required></div>
        <div class="field"><label for="o-brand">Marca</label><select id="o-brand" required><option value="">Elegí la marca…</option>${Object.keys(TRUCKS).map(m=>`<option ${onb.brandSel===m?'selected':''}>${m}</option>`).join('')}<option value="${OTHER}" ${onb.brandSel===OTHER?'selected':''}>Otra marca</option></select></div>
        <div class="field" id="o-brand-x-wrap" ${onb.brandSel===OTHER?'':'hidden'}><label for="o-brand-x">¿Qué marca?</label><input id="o-brand-x" value="${esc(onb.brandOther||'')}"></div>
        <div class="field"><label for="o-model">Modelo</label><select id="o-model" ${onb.brandSel?'':'disabled'}></select></div>
        <div class="field" id="o-model-x-wrap" ${onb.modelSel===OTHER||onb.brandSel===OTHER?'':'hidden'}><label for="o-model-x">¿Qué modelo?</label><input id="o-model-x" value="${esc(onb.modelOther||'')}"></div>
        <div class="row2"><div class="field"><label for="o-year">Año<small>opcional</small></label><select id="o-year"><option value="">—</option>${Array.from({length:new Date().getFullYear()-1979},(_,i)=>new Date().getFullYear()+1-i).map(y=>`<option ${String(onb.year)===String(y)?'selected':''}>${y}</option>`).join('')}<option value="1979" ${String(onb.year)==='1979'?'selected':''}>Antes de 1980</option></select></div>
        <div class="field"><label for="o-km">Km actuales<small>opcional</small></label><span class="fx post"><input id="o-km" inputmode="numeric" placeholder="0" value="${esc(onb.km||'')}"><i>km</i></span></div></div></div>`
  }[step];
  screen(`<form id="onb" class="view onb2" novalidate><div class="onb-top">${step>1?`<button class="btn ghost icon-btn" type="button" id="o-back" aria-label="Volver">${icon('arrow-left')}</button>`:'<span></span>'}<div class="brand">Auxili<b>OS</b></div><span class="onb-n">${step} de ${ONB_STEPS}</span></div>${stepsBar(step)}<div class="card">${body}<p id="o-err" class="err" role="alert" hidden></p></div>
    <button class="btn pri block" type="submit">${step<ONB_STEPS?'Seguir':'Empezar'}</button></form>`);
  const $=x=>document.getElementById(x),er=$('o-err'),fail=x=>{er.textContent=errText(x);er.hidden=false;er.scrollIntoView({block:'nearest',behavior:'smooth'});};
  $('o-back')?.addEventListener('click',()=>{keep();renderOnboarding(step-1);});
  // Al corregir, el aviso de error se va.
  $('onb').addEventListener('input',()=>{er.hidden=true;});$('onb').addEventListener('change',()=>{er.hidden=true;});
  // Chips: una opción o varias; «No las llevo» deja solo esa.
  document.querySelectorAll('#onb .q').forEach(fs=>{const k=fs.dataset.q,q=ONB_Q[k];
    fs.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;const v=b.dataset.v;
      if(q.multi){let a=(onb[k]||[]).slice();a=a.includes(v)?a.filter(x=>x!==v):(v==='nada'?['nada']:a.filter(x=>x!=='nada').concat(v));onb[k]=a;}else onb[k]=v;
      fs.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',String(q.multi?onb[k].includes(c.dataset.v):onb[k]===c.dataset.v)));
      fs.classList.remove('need');if(k==='providers'){const w=$('o-other-wrap');if(w)w.hidden=!onb.providers.includes('otra');}onbSave();});});
  // Guarda lo escrito aunque vuelva atrás.
  function keep(){const g=id=>$(id)?.value?.trim();
    if(step===1){onb.name=g('o-name')??onb.name;onb.phoneRaw=g('o-phone')??onb.phoneRaw;onb.biz=g('o-biz')??onb.biz;onb.province=g('o-prov')??onb.province;onb.city=g('o-city')??onb.city;}
    if(step===3)onb.providersOther=g('o-other')??onb.providersOther;
    if(step===4){onb.plate=g('o-plate')?.toUpperCase()??onb.plate;onb.brandSel=g('o-brand')??onb.brandSel;onb.brandOther=g('o-brand-x')??onb.brandOther;
      onb.modelSel=$('o-model')&&!$('o-model').disabled?$('o-model').value:onb.modelSel;onb.modelOther=g('o-model-x')??onb.modelOther;onb.year=g('o-year')??onb.year;onb.km=g('o-km')??onb.km;
      onb.brand=onb.brandSel===OTHER?(onb.brandOther||''):(onb.brandSel||'');onb.model=onb.brandSel===OTHER||onb.modelSel===OTHER?(onb.modelOther||''):(onb.modelSel||'');}
    onbSave();}
  // Modelo según la marca elegida; «Otro» (o marca «Otra») abre el campo para escribirlo.
  function fillModels(){const sel=$('o-model');if(!sel)return;const br=$('o-brand').value,list=TRUCKS[br]||[];
    if(!br||br===OTHER){sel.innerHTML='<option value="">'+(br===OTHER?'Escribilo abajo':'Primero elegí la marca')+'</option>';sel.disabled=true;}
    else{sel.disabled=false;sel.innerHTML='<option value="">Elegí el modelo…</option>'+list.map(m=>`<option ${onb.modelSel===m?'selected':''}>${esc(m)}</option>`).join('')+`<option value="${OTHER}" ${onb.modelSel===OTHER?'selected':''}>Otro modelo</option>`;}
    $('o-brand-x-wrap').hidden=br!==OTHER;$('o-model-x-wrap').hidden=!(br===OTHER||sel.value===OTHER);}
  if(step===4){fillModels();$('o-brand').addEventListener('change',()=>{onb.modelSel='';fillModels();keep();});$('o-model').addEventListener('change',()=>{$('o-model-x-wrap').hidden=$('o-model').value!==OTHER;keep();});}
  const finish=async()=>{const b=$('onb').querySelector('button[type=submit]');b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span>Armando tu cuenta…';
    try{
      const {data:part}=await db.from('solo_clients').select('id,name,kind');
      const have=new Set((part||[]).map(c=>c.name.toLowerCase()));
      if(!(part||[]).some(c=>c.kind==='particular')){const {error}=await db.from('solo_clients').insert({name:'Particular',kind:'particular',payment_days:0});if(error)throw error;have.add('particular');}
      const {data:types}=await db.from('solo_service_types').select('name');
      const missing=DEFAULT_TYPES.filter(n=>!(types||[]).some(t=>t.name.toLowerCase()===n.toLowerCase()));
      if(missing.length){const {error}=await db.from('solo_service_types').insert(missing.map(name=>({name})));if(error)throw error;}
      // Las prestadoras que marcó quedan creadas (cobro a 30 días; se cambia después).
      const names=(onb.providers||[]).filter(p=>p!=='Particulares'&&p!=='otra');
      if((onb.providers||[]).includes('otra')&&onb.providersOther)names.push(...onb.providersOther.split(/[,;/]/).map(s=>s.trim()).filter(s=>s.length>=2).slice(0,5));
      const add=[...new Set(names)].filter(n=>!have.has(n.toLowerCase())).map(name=>({name,payment_days:30}));
      if(add.length){const {error}=await db.from('solo_clients').insert(add);if(error)throw error;}
      const {data:trucks}=await db.from('solo_trucks').select('id').limit(1);
      if(!trucks?.length){const {error}=await db.from('solo_trucks').insert({plate:onb.plate,brand:onb.brand||null,model:onb.model||null,year:num(onb.year)||null,km:num(onb.km)||null});if(error)throw error;}
      const row={full_name:onb.name,business_name:onb.biz||null,phone:onb.phone,province:onb.province,city:onb.city,
        fleet_size:onb.fleet,tow_types:onb.types,drivers_mode:onb.drivers,years_in_trade:onb.years,monthly_services:onb.monthly,
        providers:onb.providers,providers_other:(onb.providers||[]).includes('otra')?(onb.providersOther||null):null,current_tools:onb.tools,pains:onb.pains||[],heard_from:onb.heard,onboarding_version:2};
      const {data:p,error}=await db.from('solo_profiles').insert(row).select('*').single();if(error)throw error;
      profile=p;try{localStorage.removeItem(onbKey());}catch(x){}onb={};toast('¡Listo! Tu cuenta está armada.');
      // De qué anuncio o campaña vino (si vino de uno) y aviso de registro al píxel de Meta, si está configurado.
      try{const src=window.AxPixel?.source?.();if(src&&!user?.user_metadata?.source)db.auth.updateUser({data:{source:src}}).catch(()=>{});window.AxPixel?.track('CompleteRegistration');}catch(_){}
      // Recién con la cuenta creada se ofrece instalar la app.
      window.SoloPWA?.offer(1500,'¡Tu cuenta está lista! Dejala a mano en tu celular.');go('inicio');
    }catch(x){fail(x);b.disabled=false;b.textContent='Empezar';}
  };
  $('onb').onsubmit=async e=>{
    e.preventDefault();er.hidden=true;keep();
    if(step===1){
      if((onb.name||'').length<2){$('o-name').focus();return fail('Escribí tu nombre.');}
      onb.phone=waNormalize(onb.phoneRaw);if(!onb.phone){$('o-phone').focus();return fail('Revisá el WhatsApp: código de área y número, por ejemplo 11 2345 6789.');}
      if(!onb.province){$('o-prov').focus();return fail('Elegí tu provincia.');}
      if((onb.city||'').length<2){$('o-city').focus();return fail('Escribí tu localidad.');}
      // Al entrar con Google no pasa por la casilla del registro: se pide acá y queda guardada en la cuenta.
      if(needsTerms()){const t=$('o-terms');if(!t.checked){t.closest('.terms').classList.add('need');return fail('Para seguir tenés que aceptar los Términos y la Política de privacidad.');}
        const {data,error}=await db.auth.updateUser({data:{terms_version:TERMS_VERSION,terms_accepted_at:new Date().toISOString()}});if(error)return fail(error);if(data?.user)user=data.user;}
      onbSave();return renderOnboarding(2);}
    if(ONB_REQ[step]){const miss=ONB_REQ[step].find(k=>ONB_Q[k].multi?!(onb[k]||[]).length:!onb[k]);
      if(miss){const fs=document.querySelector(`.q[data-q="${miss}"]`);fs.classList.add('need');fs.scrollIntoView({block:'center',behavior:'smooth'});return fail('Falta responder: '+ONB_Q[miss].label.replace(/[¿?]/g,''));}
      if(step===3&&onb.providers.includes('otra')&&(onb.providersOther||'').length<2){$('o-other').focus();return fail('Escribí cuál es la otra prestadora.');}
      return renderOnboarding(step+1);}
    if((onb.plate||'').replace(/\s/g,'').length<5){$('o-plate').focus();return fail('Escribí la patente de la grúa.');}
    if(!onb.brandSel){$('o-brand').focus();return fail('Elegí la marca de la grúa.');}
    if(onb.brandSel===OTHER&&(onb.brandOther||'').length<2){$('o-brand-x').focus();return fail('Escribí la marca de la grúa.');}
    if(!onb.model){(onb.brandSel===OTHER||onb.modelSel===OTHER?$('o-model-x'):$('o-model')).focus();return fail('Elegí o escribí el modelo de la grúa.');}
    finish();
  };
  if(matchMedia('(hover:hover) and (pointer:fine)').matches)document.querySelector('#onb input:not([type=checkbox]),#onb select')?.focus({preventScroll:true});
}

/* ── Pantallas con barra inferior ─────────────────────── */
const TABS=[['inicio','Inicio','layout-dashboard'],['servicios','Servicios','file-text'],['gastos','Gastos','wallet'],['mas','Más','ellipsis']];
// bare: pantalla completa sin barra (remito, nuevo servicio, nuevo gasto), con su propio botón para salir.
function shell(html,active,opts){
  const bare=!!opts?.bare;app.classList.toggle('bare',bare);
  app.innerHTML=`<div class="view">${html}</div>`+(bare?'':`<div class="tabbar"><nav aria-label="Secciones">${TABS.map(([k,l,i])=>`<button class="tab" type="button" data-go="${k}" ${active===k?'aria-current="page"':''}>${icon(i)}<span>${l}</span></button>`).join('')}</nav></div>`);
  app.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
}
// Pantalla principal desde la que se entró (para volver de Prestadoras al lugar correcto).
let lastMain='inicio';
function render(){
  if(TABS.some(t=>t[0]===view))lastMain=view;
  if(view==='inicio')return renderInicio();
  if(view==='mas')return renderMas();
  if(views[view])return views[view](detailId);
  return renderPronto(view);
}

async function renderInicio(){
  // Si tiene la cuenta creada y nunca vio el aviso (por ejemplo, la creó en la compu), se le ofrece instalar.
  window.SoloPWA?.offer(1800);
  const first=(profile.full_name||'').split(' ')[0];
  shell(`<div class="top"><div class="brand">Auxili<b>OS</b></div><span class="sub">Hola, ${esc(first)}</span></div>
    <div class="month"><button class="btn ghost icon-btn" type="button" id="m-prev" aria-label="Mes anterior">${icon('chevron-left')}</button><h1 id="m-name">${esc(monthName(month))}</h1><button class="btn ghost icon-btn" type="button" id="m-next" aria-label="Mes siguiente">${icon('chevron-right')}</button></div>
    <div id="alerts" class="alerts" aria-live="polite"></div>
    <div id="sum" class="stack" aria-busy="true"><i class="sk kpi-sk"></i><i class="sk kpi-sk tall"></i><i class="sk kpi-sk"></i></div>
    <div class="split"><div class="btn pri" role="button" tabindex="0" id="new-svc">${icon('plus')} Servicio</div><div class="btn" role="button" tabindex="0" id="new-exp">${icon('plus')} Gasto</div></div>
    <button class="item item-row" type="button" data-go="facturacion">${icon('receipt','lead')}<span><b>Facturación por prestadora</b><span class="hint">Cuánto le facturás a cada una y qué falta cobrar</span></span>${icon('chevron-right','trail')}</button>
    <button class="item item-row" type="button" data-go="clientes">${icon('building-2','lead')}<span><b>Prestadoras y tarifas</b><span class="hint">A quién le facturás y cuánto le cobrás</span></span>${icon('chevron-right','trail')}</button>`,'inicio');
  document.getElementById('m-prev').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderInicio();};
  document.getElementById('m-next').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderInicio();};
  [['new-svc','nuevo'],['new-exp','gastos-nuevo']].forEach(([id,to])=>{const el=document.getElementById(id);const f=()=>go(to);el.onclick=f;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f();}};});
  const {data:s,error}=await db.rpc('solo_month_summary_v1',{p_month:isoDate(month)});
  const box=document.getElementById('sum');if(!box)return;box.removeAttribute('aria-busy');
  if(error){box.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  const left=Number(s.left)||0;
  const pct=Number(s.billed)>0?Math.max(0,Math.min(100,Math.round(Number(s.collected)/Number(s.billed)*100))):0;
  box.innerHTML=`<div class="split"><div class="kpi in kpi-link" role="button" tabindex="0" id="k-billed" aria-label="Facturé: ver por prestadora"><span>Facturé ${icon('chevron-right','kpi-go')}</span><b data-count="${Number(s.billed)||0}">$ 0</b></div>
    <div class="kpi out"><span>Gasté</span><b data-count="${Number(s.spent)||0}">$ 0</b></div></div>
    <div class="kpi left kpi-link ${left<0?'neg':''}" role="button" tabindex="0" id="k-left" aria-label="Me queda: ver mis números"><span>Me queda ${icon('chevron-right','kpi-go')}</span><b data-count="${left}">$ 0</b></div>
    <div class="card tight"><div class="row"><span class="hint">Cobrado</span><b class="num" data-count="${Number(s.collected)||0}">$ 0</b></div>
      <div class="bar" role="img" aria-label="Cobraste el ${pct}% de lo facturado"><i style="--w:${pct}%"></i></div>
      <div class="row"><span class="hint">Por cobrar</span><b class="num" style="color:var(--ax-warn)" data-count="${Number(s.pending)||0}">$ 0</b></div></div>
    <p class="hint">${Number(s.services)?Number(s.services)+' servicios':'Sin servicios todavía'} · fijos ${money(s.fixed_expenses)} · variables ${money(s.variable_expenses)}</p>`;
  [['k-billed','facturacion'],['k-left','numeros']].forEach(([id,to])=>{const k=document.getElementById(id);k.onclick=()=>go(to);k.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(to);}};});
  renderAlerts();
}
// Avisos de cobro: lo vencido primero; se ven hasta dos y el resto queda en Facturación.
async function renderAlerts(){
  if(!window.SoloAlerts)return;const list=await window.SoloAlerts.load();const box=document.getElementById('alerts');if(!box)return;
  const ICON={bad:'triangle-alert',wait:'calendar-clock',info:'file-warning'};
  box.innerHTML=list.slice(0,2).map((a,i)=>`<button class="alert ${a.k}" type="button" data-i="${i}">${icon(ICON[a.k])}<span><b class="ell">${esc(a.title)}</b><small class="ell">${esc(a.sub)}</small></span>${i===1&&list.length>2?`<em>+${list.length-2}</em>`:icon('chevron-right','trail')}</button>`).join('');
  box.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const a=list[Number(b.dataset.i)];if(a.go)return go(a.go);const d=new Date(a.month+'T12:00:00');month=new Date(d.getFullYear(),d.getMonth(),1);go('facturacion-'+a.client);});
}

async function renderMas(){
  // Estructura tomada de apps de ajustes muy usadas (Signal, Bitwarden, Cashew): tarjeta de perfil arriba,
  // grupos en tarjetas con filas compactas (ícono, título, dato a la derecha) y la salida de la cuenta aparte, al final.
  const canInstall=window.SoloPWA&&!window.SoloPWA.installed;
  const P=profile||{},name=P.business_name||P.full_name||'Tu grúa',cuit=P.cuit&&String(P.cuit).length===11?String(P.cuit).replace(/^(\d{2})(\d{8})(\d)$/,'$1-$2-$3'):'';
  const TAX={monotributo:'Monotributo',responsable_inscripto:'Resp. inscripto',exento:'Exento'};
  const initials=String(name).split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'A';
  const row=(go,ic,title,{val='',id='',danger=false}={})=>`<button class="set-row${danger?' danger':''}" type="button" ${go?`data-go="${go}"`:''} ${id?`id="${id}"`:''}><span class="set-ico">${icon(ic)}</span><span class="set-t">${title}</span><span class="set-v" ${id?`data-v="${id}"`:''}>${val}</span>${icon('chevron-right','set-chev')}</button>`;
  const group=(label,rows)=>`<section class="set-group" aria-label="${label}"><h2 class="set-label">${label}</h2><div class="set-card">${rows.join('')}</div></section>`;
  shell(`<h1 class="set-title">Más</h1>
    <button class="set-profile" type="button" data-go="perfil" aria-label="Datos del remito">
      <span class="set-avatar" id="mas-av">${esc(initials)}</span>
      <span class="set-pt"><b class="ell">${esc(name)}</b><small class="ell">${esc([P.business_name&&P.full_name?P.full_name:'',user?.email||''].filter(Boolean).join(' · '))}</small>
        ${cuit?`<em class="set-chip ok">CUIT ${cuit}${TAX[P.tax_condition]?' · '+TAX[P.tax_condition]:''}</em>`:`<em class="set-chip warn">${icon('circle-alert')} Completá CUIT y logo del remito</em>`}</span>
      ${icon('chevron-right','set-chev')}</button>
    ${group('Tu negocio',[row('numeros','chart-column','Mis números'),row('facturacion','receipt','Facturación por prestadora')])}
    ${group('Configuración',[row('clientes','building-2','Prestadoras y tarifas',{id:'v-cli'}),row('tipos-mas','list-checks','Tipos de servicio',{id:'v-tip'}),row('grua','truck','Mi grúa',{id:'v-gru'})])}
    ${group('Ayuda',[row('','life-buoy','Ayuda y soporte',{id:'help'}),row('','file-text','Términos y privacidad',{id:'terms'}),...(canInstall?[row('','download','Instalar la app',{id:'inst'})]:[])])}
    <button class="set-logout" type="button" id="logout">${icon('log-out')} Cerrar sesión</button>
    <p class="set-foot">AuxiliOS · ${esc(appVersion().replace(/^solo-|-\d{8}$/g,'')||'')}</p>`,'mas');
  document.getElementById('help').onclick=()=>support();
  document.getElementById('terms').onclick=()=>window.open('/terminos-solo.html','_blank','noopener');
  document.getElementById('inst')?.addEventListener('click',()=>window.SoloPWA.open());
  document.getElementById('logout').onclick=async()=>{
    const n=window.SoloOffline?await window.SoloOffline.pending():0;
    if(n&&!confirm(`Tenés ${n} cambio${n===1?'':'s'} cargado${n===1?'':'s'} sin señal que todavía no se subieron. Si cerrás la sesión se pierden. ¿Cerrar igual?`))return;
    await db.auth.signOut();if(window.SoloOffline)await window.SoloOffline.clear();location.hash='';};
  // Datos a la derecha de cada fila y logo propio en el perfil (se completan sin frenar la pantalla).
  const set=(id,t)=>{const el=app.querySelector(`[data-v="${id}"]`);if(el)el.textContent=t;};
  const [cl,tp,tk]=await Promise.all([db.from('solo_clients').select('id,kind,active'),db.from('solo_service_types').select('id,active'),db.from('solo_trucks').select('*').order('created_at').limit(1).maybeSingle()]);
  const nCli=(cl.data||[]).filter(c=>c.kind!=='particular'&&c.active!==false).length,nTip=(tp.data||[]).filter(t=>t.active!==false).length;
  set('v-cli',nCli?nCli+(nCli===1?' activa':' activas'):'Sin cargar');set('v-tip',nTip?String(nTip):'');const w=(window.SoloGrua?.truckWarnings(tk.data)||[])[0];set('v-gru',w?w.what+': '+w.txt.toLowerCase():tk.data?.plate||'Sin cargar');
  if(w)app.querySelector('[data-v="v-gru"]')?.classList.add('set-v-'+w.k);
  if(P.logo_path){const {data}=await db.storage.from('solo_files').createSignedUrl(P.logo_path,3600);const av=document.getElementById('mas-av');
    if(av&&data?.signedUrl){av.classList.add('own');av.innerHTML=`<img src="${data.signedUrl}" alt="">`;}}
}
/* ── Ayuda y soporte: arma el mensaje con lo que necesitamos para ayudar (cuenta, versión, pantalla, cambios sin subir) ── */
const TOPICS=['No puedo entrar','Remitos y firma','Sin señal','Facturación y cobros','Gastos','Otra consulta'];
const appVersion=()=>((document.querySelector('script[src*="/solo/solo.js"]')?.src||'').match(/[?&]v=([^&]+)/)||[])[1]||'';
async function support(topic,mail){
  const wa=String(RT.supportWhatsapp||''),em=String(RT.supportEmail||'');
  const S=window.SoloSheets;if(!S)return;
  if(!wa&&!em){S.sheet('Ayuda y soporte','<p class="sub">El canal de ayuda todavía no está configurado. Probá de nuevo más tarde.</p>');return;}
  let pick=TOPICS.includes(topic)?topic:topic||'';
  const sh=S.sheet('Ayuda y soporte',`<div class="help">
      <p class="sub">Contanos qué pasó y te respondemos lo antes posible.</p>
      <div class="cf-days help-topics" role="radiogroup" aria-label="Tema">${TOPICS.map(t=>`<button type="button" class="chip" role="radio" data-t="${esc(t)}" aria-pressed="${t===pick}">${esc(t)}</button>`).join('')}</div>
      <div class="field"><label for="hp-msg">Detalle (opcional)</label><textarea id="hp-msg" rows="3" maxlength="600" placeholder="Ej.: no me deja firmar el remito N.º 12"></textarea></div>
      <div class="help-actions">${wa?`<button class="btn pri block" type="button" id="hp-wa">${icon('message-circle')} Escribir por WhatsApp</button>`:''}${em?`<button class="btn block" type="button" id="hp-em">${icon('mail')} Mandar un email</button>`:''}</div>
      <p class="hint">Se envía con tu cuenta y la versión de la app para que podamos ayudarte más rápido.</p></div>`);
  sh.el.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{pick=b.dataset.t;sh.el.querySelectorAll('[data-t]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  const pend=window.SoloOffline?await window.SoloOffline.pending().catch(()=>0):0;
  const body=()=>{const who=profile?.full_name||user?.user_metadata?.full_name||'';const acct=user?.email||mail||'';
    return [`Hola, ${who?'soy '+who+'. ':''}Necesito ayuda con AuxiliOS.`,pick?'Tema: '+pick:'',sh.el.querySelector('#hp-msg').value.trim(),'',
      '— Datos para soporte —',acct?'Cuenta: '+acct:'','Versión: '+appVersion(),'Pantalla: '+(location.hash.slice(1)||'inicio'),pend?'Cambios sin subir: '+pend:'',navigator.onLine?'':'Sin conexión',
      'Equipo: '+(navigator.userAgent.match(/(iPhone|iPad|Android[^;)]*|Windows|Mac OS X)/)||['otro'])[0]].filter(x=>x!=='').join('\n');};
  sh.el.querySelector('#hp-wa')?.addEventListener('click',()=>{window.open('https://wa.me/'+wa+'?text='+encodeURIComponent(body()),'_blank','noopener');sh.close();});
  sh.el.querySelector('#hp-em')?.addEventListener('click',()=>{location.href='mailto:'+em+'?subject='+encodeURIComponent('Ayuda AuxiliOS'+(pick?' · '+pick:''))+'&body='+encodeURIComponent(body());sh.close();});
}
function renderPronto(v){
  const txt={servicios:['Servicios','Acá vas a ver los servicios del mes, cargar uno nuevo y hacer su remito con firma.'],gastos:['Gastos','Acá vas a cargar combustible, taller y peajes en dos toques, y tus gastos fijos repartidos por mes.']}[v]||['AuxiliOS',''];
  shell(`<h1>${txt[0]}</h1><div class="empty"><b>Llega en la próxima entrega</b><span>${txt[1]}</span></div>`,v);
}

window.SoloCore={views,shell,go,toast,esc,money,num,isoDate,monthName,errText,icon,support,
  get db(){return db;},get user(){return user;},get profile(){return profile;},set profile(p){profile=p;},
  get month(){return month;},set month(d){month=d;}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
