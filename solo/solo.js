// AuxiliOS Solo · registro e ingreso, alta inicial, Inicio con los tres números y Prestadoras con sus tarifas.
// Todo se guarda en las tablas solo_* de la base de la instalación; cada gruero ve solo lo suyo (reglas de la base).
(function(){
'use strict';
const app=document.getElementById('app');
const RT=window.AUXILIOS_RUNTIME||{};
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
  db=window.supabase.createClient(RT.supabaseUrl,RT.supabaseKey);
  db.auth.onAuthStateChange((event,session)=>{const u=session?.user||null;
    if(event==='PASSWORD_RECOVERY'){recovering=true;user=u;return renderNewPassword();}
    if((u?.id||null)!==(user?.id||null)){user=u;boot();}});
  db.auth.getSession().then(({data})=>{user=data.session?.user||null;boot();});
}
async function boot(){
  if(recovering&&user)return renderNewPassword();
  if(!user){profile=null;return renderAuth('login');}
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
function readAuthHash(){
  const h=location.hash.slice(1);if(!/(^|&)(error|access_token|type)=/.test(h))return;
  const q=new URLSearchParams(h);
  if(q.get('type')==='recovery')recovering=true;
  if(q.get('error')||q.get('error_code')){
    authNotice=/expired|invalid/i.test((q.get('error_code')||'')+' '+(q.get('error_description')||''))?'El enlace del email venció o ya se usó. Pedí uno nuevo.':'No pudimos validar el enlace del email. Pedí uno nuevo.';
    history.replaceState(null,'',location.pathname);
  }
}
function screen(html){app.classList.add('bare');app.innerHTML=html;}
const passField=(id,label,auto,help)=>`<div class="field"><label for="${id}">${label}</label><div class="pass"><input id="${id}" type="password" autocomplete="${auto}" minlength="6" required autocapitalize="none" spellcheck="false"><button class="eye" type="button" data-eye="${id}" aria-label="Mostrar contraseña" aria-pressed="false">${icon('eye')}</button></div>${help?'<span class="help">'+help+'</span>':''}</div>`;
// Ojito: muestra u oculta la contraseña sin perder el cursor.
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-eye]');if(!b)return;const inp=document.getElementById(b.dataset.eye);if(!inp)return;
  const show=inp.type==='password';const pos=inp.selectionStart;inp.type=show?'text':'password';
  b.setAttribute('aria-pressed',String(show));b.setAttribute('aria-label',show?'Ocultar contraseña':'Mostrar contraseña');b.innerHTML=icon(show?'eye-off':'eye');
  inp.focus({preventScroll:true});try{inp.setSelectionRange(pos,pos);}catch(x){}});

function renderAuth(mode){
  const signup=mode==='signup',reset=mode==='reset';
  const title=signup?'Creá tu cuenta':reset?'Recuperá tu contraseña':'Entrá a tu cuenta';
  const sub=signup?'Lo que facturás, lo que gastás y lo que te queda, todo en el celular.':reset?'Te mandamos un enlace a tu email para elegir una contraseña nueva.':'Tus servicios, gastos y cuentas del mes.';
  const cta=signup?'Crear cuenta':reset?'Mandarme el enlace':'Entrar';
  screen(`<div class="view auth">
    <div class="auth-brand"><img src="/assets/icons/icon-192.png" alt="" width="52" height="52"><div class="brand">AuxiliOS <b>Solo</b></div></div>
    <h1>${title}</h1>
    <p class="sub">${sub}</p>
    ${authNotice?`<p class="notice" role="alert">${icon('circle-alert')}<span>${esc(authNotice)}</span></p>`:''}
    <form id="auth" class="card" novalidate>
      ${signup?'<div class="field"><label for="a-name">Tu nombre</label><input id="a-name" autocomplete="name" required></div>':''}
      <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required value="${esc(authEmail)}"></div>
      ${reset?'':passField('a-pass','Contraseña',signup?'new-password':'current-password',signup?'Al menos 6 caracteres.':'')}
      <p id="a-err" class="err" hidden></p>
      <button class="btn pri block" type="submit">${cta}</button>
      ${!signup&&!reset?'<button class="link center" id="a-forgot" type="button">¿Olvidaste tu contraseña?</button>':''}
    </form>
    <p class="sub center">${reset?'¿Te acordaste?':signup?'¿Ya tenés cuenta?':'¿Todavía no tenés cuenta?'} <button class="link" id="a-switch" type="button">${reset?'Entrá':signup?'Entrá':'Creala gratis'}</button></p>
  </div>`);
  authNotice=null;
  const $=x=>document.getElementById(x),er=$('a-err');
  $('a-switch').onclick=()=>{authEmail=$('a-email').value.trim();renderAuth(signup?'login':reset?'login':'signup');};
  $('a-forgot')?.addEventListener('click',()=>{authEmail=$('a-email').value.trim();renderAuth('reset');});
  const fail=(msg,resend)=>{er.innerHTML=esc(msg)+(resend?' <button class="link" type="button" id="a-resend">Reenviar email</button>':'');er.hidden=false;
    $('a-resend')?.addEventListener('click',()=>renderCheckEmail(authEmail,'signup',true));};
  $('auth').onsubmit=async e=>{
    e.preventDefault();const b=e.target.querySelector('button[type=submit]');er.hidden=true;
    const email=$('a-email').value.trim(),password=$('a-pass')?.value||'';authEmail=email;
    if(!email||(!reset&&password.length<6))return fail('Completá el email'+(reset?'.':' y una contraseña de al menos 6 caracteres.'));
    b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span>'+(signup?'Creando…':reset?'Mandando…':'Entrando…');
    try{
      if(reset){const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:backUrl()});if(error)throw error;return renderCheckEmail(email,'reset');}
      if(signup){
        const name=$('a-name').value.trim();
        const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:backUrl()}});
        if(error)throw error;
        // Supabase no avisa con error cuando el email ya existe: devuelve un usuario sin identidades.
        if(data.user&&Array.isArray(data.user.identities)&&!data.user.identities.length)throw new Error('already registered');
        if(!data.session)return renderCheckEmail(email,'signup');
      }else{const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error;}
    }catch(x){fail(errText(x),/Email not confirmed/i.test(String(x?.message||'')));b.disabled=false;b.textContent=cta;}
  };
}
// Pantalla de «revisá tu email», con reenvío (una vez por minuto, como pide Supabase).
function renderCheckEmail(email,kind,sendNow){
  const reset=kind==='reset';
  screen(`<div class="view auth">
    <div class="auth-brand"><img src="/assets/icons/icon-192.png" alt="" width="52" height="52"><div class="brand">AuxiliOS <b>Solo</b></div></div>
    <div class="mail-ico" aria-hidden="true">${icon('circle-check')}</div>
    <h1>Revisá tu email</h1>
    <p class="sub">Te mandamos un enlace a <b>${esc(email)}</b>. ${reset?'Tocalo para elegir una contraseña nueva.':'Tocalo para confirmar tu cuenta: se abre AuxiliOS Solo y ya entrás.'}</p>
    <p class="hint">¿No te llegó? Mirá en Spam o Promociones. Puede tardar un par de minutos.</p>
    <p id="a-err" class="err" hidden></p>
    <button class="btn block" type="button" id="resend">Reenviar email</button>
    <button class="btn ghost block" type="button" id="back">Volver a entrar</button>
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
    <div class="auth-brand"><img src="/assets/icons/icon-192.png" alt="" width="52" height="52"><div class="brand">AuxiliOS <b>Solo</b></div></div>
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

/* ── Alta inicial: perfil → grúa → primera prestadora ── */
function stepsBar(n){return '<div class="steps" aria-label="Paso '+n+' de 3">'+[1,2,3].map(i=>'<i class="'+(i<=n?'on':'')+'"></i>').join('')+'</div>';}
function renderOnboarding(step){
  const metaName=user?.user_metadata?.full_name||'';
  const body={
    1:`<h1>Bienvenido</h1><p class="sub">Contanos quién sos. Lo usamos en tus remitos.</p>
      <div class="field"><label for="o-name">Nombre y apellido</label><input id="o-name" autocomplete="name" value="${esc(metaName)}" required></div>
      <div class="field"><label for="o-biz">Nombre comercial (opcional)</label><input id="o-biz" placeholder="Ej.: Grúas Pérez"></div>
      <div class="field"><label for="o-phone">Teléfono (opcional)</label><input id="o-phone" type="tel" inputmode="tel" autocomplete="tel"></div>`,
    2:`<h1>Tu grúa</h1><p class="sub">La patente sale en cada remito.</p>
      <div class="field"><label for="o-plate">Patente</label><input id="o-plate" autocapitalize="characters" placeholder="AB 123 CD" required></div>
      <div class="grid2"><div class="field"><label for="o-brand">Marca</label><input id="o-brand" placeholder="Iveco"></div><div class="field"><label for="o-model">Modelo</label><input id="o-model" placeholder="Daily"></div></div>
      <div class="field"><label for="o-km">Km actuales (opcional)</label><input id="o-km" inputmode="numeric"></div>`,
    3:`<h1>Tu primera prestadora</h1><p class="sub">La empresa que más servicios te pasa. Las tarifas las cargás después. «Particular» ya viene creado.</p>
      <div class="field"><label for="o-client">Nombre de la prestadora</label><input id="o-client" placeholder="Ej.: Asistencia Ruta S.A."></div>
      <div class="field"><label for="o-days">¿A cuántos días te paga?</label><input id="o-days" inputmode="numeric" value="30"></div>`
  }[step];
  screen(`<form id="onb" class="view" novalidate><div class="brand">AuxiliOS <b>Solo</b></div>${stepsBar(step)}<div class="card">${body}<p id="o-err" class="err" hidden></p></div>
    <button class="btn pri block" type="submit">${step<3?'Seguir':'Empezar'}</button>
    ${step===3?'<button class="btn ghost block" type="button" id="o-skip">Lo cargo después</button>':''}</form>`);
  const er=document.getElementById('o-err'),fail=x=>{er.textContent=errText(x);er.hidden=false;};
  const finish=async(withClient)=>{
    try{
      const {data:part}=await db.from('solo_clients').select('id').eq('kind','particular').limit(1);
      if(!part?.length){const {error}=await db.from('solo_clients').insert({name:'Particular',kind:'particular',payment_days:0});if(error)throw error;}
      const {data:types}=await db.from('solo_service_types').select('name');
      const missing=DEFAULT_TYPES.filter(n=>!(types||[]).some(t=>t.name.toLowerCase()===n.toLowerCase()));
      if(missing.length){const {error}=await db.from('solo_service_types').insert(missing.map(name=>({name})));if(error)throw error;}
      let clientId=null;
      if(withClient){const name=document.getElementById('o-client').value.trim();if(name.length<2)throw new Error('Escribí el nombre de la prestadora o tocá «Lo cargo después».');
        const {data,error}=await db.from('solo_clients').insert({name,payment_days:Math.round(num(document.getElementById('o-days').value))||30}).select('id').single();if(error)throw error;clientId=data.id;}
      const {data:p,error}=await db.from('solo_profiles').insert({full_name:onb.name,business_name:onb.biz||null,phone:onb.phone||null}).select('*').single();if(error)throw error;
      profile=p;toast('¡Listo! Tu cuenta está armada.');go(clientId?'cliente-'+clientId:'inicio');
    }catch(x){fail(x);}
  };
  document.getElementById('onb').onsubmit=async e=>{
    e.preventDefault();er.hidden=true;
    if(step===1){const name=document.getElementById('o-name').value.trim();if(name.length<2)return fail('Escribí tu nombre.');
      onb.name=name;onb.biz=document.getElementById('o-biz').value.trim();onb.phone=document.getElementById('o-phone').value.trim();return renderOnboarding(2);}
    if(step===2){const plate=document.getElementById('o-plate').value.trim().toUpperCase();if(plate.replace(/\s/g,'').length<5)return fail('Escribí la patente de la grúa.');
      const {error}=await db.from('solo_trucks').insert({plate,brand:document.getElementById('o-brand').value.trim()||null,model:document.getElementById('o-model').value.trim()||null,km:num(document.getElementById('o-km').value)||null});
      if(error)return fail(error);return renderOnboarding(3);}
    finish(true);
  };
  document.getElementById('o-skip')?.addEventListener('click',()=>finish(false));
}
const onb={name:'',biz:'',phone:''};

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
  if(view==='clientes')return renderClientes();
  if(view==='cliente')return renderCliente(detailId);
  if(view==='mas')return renderMas();
  if(views[view])return views[view](detailId);
  return renderPronto(view);
}

async function renderInicio(){
  const first=(profile.full_name||'').split(' ')[0];
  shell(`<div class="top"><div class="brand">AuxiliOS <b>Solo</b></div><span class="sub">Hola, ${esc(first)}</span></div>
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
    <div class="kpi left ${left<0?'neg':''}"><span>Me queda</span><b data-count="${left}">$ 0</b></div>
    <div class="card tight"><div class="row"><span class="hint">Cobrado</span><b class="num" data-count="${Number(s.collected)||0}">$ 0</b></div>
      <div class="bar" role="img" aria-label="Cobraste el ${pct}% de lo facturado"><i style="--w:${pct}%"></i></div>
      <div class="row"><span class="hint">Por cobrar</span><b class="num" style="color:var(--ax-warn)" data-count="${Number(s.pending)||0}">$ 0</b></div></div>
    <p class="hint">${Number(s.services)?Number(s.services)+' servicios':'Sin servicios todavía'} · fijos ${money(s.fixed_expenses)} · variables ${money(s.variable_expenses)}</p>`;
  const k=document.getElementById('k-billed');k.onclick=()=>go('facturacion');k.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go('facturacion');}};
  renderAlerts();
}
// Avisos de cobro: lo vencido primero; se ven hasta dos y el resto queda en Facturación.
async function renderAlerts(){
  if(!window.SoloAlerts)return;const list=await window.SoloAlerts.load();const box=document.getElementById('alerts');if(!box)return;
  const ICON={bad:'triangle-alert',wait:'calendar-clock',info:'file-warning'};
  box.innerHTML=list.slice(0,2).map((a,i)=>`<button class="alert ${a.k}" type="button" data-i="${i}">${icon(ICON[a.k])}<span><b class="ell">${esc(a.title)}</b><small class="ell">${esc(a.sub)}</small></span>${i===1&&list.length>2?`<em>+${list.length-2}</em>`:icon('chevron-right','trail')}</button>`).join('');
  box.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const a=list[Number(b.dataset.i)];if(a.go)return go(a.go);const d=new Date(a.month+'T12:00:00');month=new Date(d.getFullYear(),d.getMonth(),1);go('facturacion-'+a.client);});
}

async function renderClientes(){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Volver">${icon('arrow-left')}</button><h1 class="grow">Prestadoras y tarifas</h1></div>
    <p class="sub">A quién le facturás, a cuántos días te paga y cuánto le cobrás.</p>
    <div id="list" class="stack fill"><div class="sk-group" aria-busy="true" aria-label="Cargando"><i class="sk"></i><i class="sk"></i><i class="sk short"></i></div></div>
    <button class="btn pri block" type="button" id="add-open">${icon('plus')} Nueva prestadora</button>
    <form id="add" class="card" novalidate hidden><div class="row"><h2>Nueva prestadora</h2><button class="btn ghost icon-btn" type="button" id="add-x" aria-label="Cerrar">${icon('x')}</button></div>
      <div class="grid2 wide-first"><div class="field"><label for="c-name">Nombre</label><input id="c-name" placeholder="Ej.: Seguros del Sur"></div>
      <div class="field"><label for="c-days">Días de pago</label><input id="c-days" inputmode="numeric" value="30"></div></div>
      <p id="c-err" class="err" hidden></p><button class="btn pri block" type="submit">Agregar</button></form>`,'mas');
  document.getElementById('back').onclick=()=>go(lastMain);
  const tog=on=>{document.getElementById('add').hidden=!on;document.getElementById('add-open').hidden=on;if(on)document.getElementById('c-name').focus();};
  document.getElementById('add-open').onclick=()=>tog(true);document.getElementById('add-x').onclick=()=>tog(false);
  if(detailId==='nueva')tog(true);
  const [{data:clients,error},{data:rates}]=await Promise.all([db.from('solo_clients').select('*').order('kind',{ascending:false}).order('name'),db.from('solo_rates').select('client_id')]);
  const list=document.getElementById('list');if(!list)return;
  if(error){list.innerHTML='<div class="empty">'+esc(errText(error))+'</div>';return;}
  const count=id=>(rates||[]).filter(r=>r.client_id===id).length;
  list.innerHTML=(clients||[]).map(c=>`<button class="item" type="button" data-id="${c.id}"><div class="row"><b class="ell">${esc(c.name)}</b>${c.kind==='particular'?'<span class="pill muted">Cobro al momento</span>':count(c.id)?`<span class="pill ok">${count(c.id)} tarifa${count(c.id)>1?'s':''}</span>`:'<span class="pill wait">Sin tarifas</span>'}</div><span class="hint">${c.kind==='particular'?'Precio libre en cada servicio':'Paga a '+c.payment_days+' días'}</span></button>`).join('')||'<div class="empty">Todavía no cargaste prestadoras.</div>';
  list.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>go('cliente-'+b.dataset.id));
  document.getElementById('add').onsubmit=async e=>{e.preventDefault();const er=document.getElementById('c-err');er.hidden=true;
    const name=document.getElementById('c-name').value.trim();if(name.length<2){er.textContent='Escribí el nombre.';er.hidden=false;return;}
    const {data,error}=await db.from('solo_clients').insert({name,payment_days:Math.round(num(document.getElementById('c-days').value))||30}).select('id').single();
    if(error){er.textContent=errText(error);er.hidden=false;return;}toast('Prestadora agregada');go('cliente-'+data.id);};
}

async function renderCliente(id){
  shell(`<div class="top"><button class="btn ghost icon-btn" type="button" id="back" aria-label="Prestadoras">${icon('arrow-left')}</button><h1 class="grow" id="cl-name">Prestadora</h1></div><div id="cl" class="stack fill"><div class="sk-group" aria-busy="true" aria-label="Cargando"><i class="sk"></i><i class="sk"></i><i class="sk short"></i></div></div>`,'mas');
  document.getElementById('back').onclick=()=>go('clientes');
  const [{data:c,error},{data:types},{data:rates}]=await Promise.all([
    db.from('solo_clients').select('*').eq('id',id).maybeSingle(),
    db.from('solo_service_types').select('*').eq('active',true).order('name'),
    db.from('solo_rates').select('*').eq('client_id',id).order('valid_from',{ascending:false})]);
  const box=document.getElementById('cl');if(!box)return;
  if(error||!c){box.innerHTML='<div class="empty">No encontramos esa prestadora.</div>';return;}
  const current=t=>(rates||[]).find(r=>r.service_type_id===t.id&&r.valid_from<=isoDate(new Date()))||(rates||[]).find(r=>r.service_type_id===t.id);
  const particular=c.kind==='particular';
  document.getElementById('cl-name').textContent=c.name;
  box.innerHTML=`
    ${particular?'<p class="sub">Para clientes que pagan en el momento. El precio lo ponés en cada servicio.</p>':`<form id="cfg" class="card" novalidate><div class="grid2"><div class="field"><label for="d-days">Días de pago</label><input id="d-days" inputmode="numeric" value="${c.payment_days}"></div><div class="field" style="align-self:end"><button class="btn block" type="submit">Guardar</button></div></div></form>`}
    ${particular?'':`<h2>Tarifas</h2><p class="hint">Precio base, km incluidos en la base y precio por km extra. Cada cambio queda con su fecha, así no se tocan los servicios viejos.</p>
    <div class="rates">${(types||[]).map(t=>{const r=current(t);return `<form class="card rate-form" data-type="${t.id}" novalidate>
      <div class="row"><b>${esc(t.name)}</b>${r?`<span class="pill ok">Desde ${esc(r.valid_from.split('-').reverse().join('/'))}</span>`:'<span class="pill wait">Sin tarifa</span>'}</div>
      <div class="grid2"><div class="field"><label for="b-${t.id}">Base $</label><input id="b-${t.id}" inputmode="decimal" value="${r?r.base_amount:''}"></div>
      <div class="field"><label for="k-${t.id}">Km incluidos</label><input id="k-${t.id}" inputmode="numeric" value="${r?r.included_km:''}"></div></div>
      <div class="grid2"><div class="field"><label for="p-${t.id}">$ por km extra</label><input id="p-${t.id}" inputmode="decimal" value="${r?r.per_km:''}"></div>
      <div class="field"><label for="v-${t.id}">Vigente desde</label><input id="v-${t.id}" type="date" value="${isoDate(new Date())}"></div></div>
      ${r?`<p class="hint">Ejemplo con 48 km: ${money(Number(r.base_amount)+Math.max(0,48-Number(r.included_km))*Number(r.per_km))}</p>`:''}
      <button class="btn block" type="submit">${r?'Guardar cambio':'Guardar tarifa'}</button></form>`;}).join('')}</div>`}
    <form id="nt" class="card" novalidate><h2>Otro tipo de servicio</h2><div class="field"><label for="t-name">Nombre</label><input id="t-name" placeholder="Ej.: Paso de corriente"></div><p id="t-err" class="err" hidden></p><button class="btn block" type="submit">Agregar tipo</button></form>`;
  document.getElementById('cfg')?.addEventListener('submit',async e=>{e.preventDefault();const {error}=await db.from('solo_clients').update({payment_days:Math.round(num(document.getElementById('d-days').value))}).eq('id',id);toast(error?errText(error):'Guardado');});
  box.querySelectorAll('.rate-form').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const t=f.dataset.type,g=k=>document.getElementById(k+'-'+t).value;
    const row={client_id:id,service_type_id:t,base_amount:num(g('b')),included_km:num(g('k')),per_km:num(g('p')),valid_from:g('v')||isoDate(new Date())};
    if(!row.base_amount&&!row.per_km)return toast('Poné al menos el precio base o el precio por km.');
    const {error}=await db.from('solo_rates').upsert(row,{onConflict:'client_id,service_type_id,valid_from'});toast(error?errText(error):'Tarifa guardada');if(!error)renderCliente(id);});
  document.getElementById('nt').onsubmit=async e=>{e.preventDefault();const er=document.getElementById('t-err');er.hidden=true;const name=document.getElementById('t-name').value.trim();
    if(name.length<2){er.textContent='Escribí el nombre del servicio.';er.hidden=false;return;}
    const {error}=await db.from('solo_service_types').insert({name});if(error){er.textContent=errText(error);er.hidden=false;return;}toast('Tipo agregado');renderCliente(id);};
}

async function renderMas(){
  const canInstall=window.SoloPWA&&!window.SoloPWA.installed;
  shell(`<h1>Más</h1>
    <button class="item item-row" type="button" data-go="facturacion">${icon('receipt','lead')}<span><b>Facturación por prestadora</b><span class="hint">Resumen del mes, facturado y cobrado</span></span>${icon('chevron-right','trail')}</button>
    <button class="item item-row" type="button" data-to="clientes">${icon('building-2','lead')}<span><b>Prestadoras y tarifas</b><span class="hint">Empresas, días de pago y precios</span></span>${icon('chevron-right','trail')}</button>
    ${canInstall?`<button class="item item-row" type="button" id="inst">${icon('download','lead')}<span><b>Instalar la app</b><span class="hint">Tenela en la pantalla de inicio del celular</span></span>${icon('chevron-right','trail')}</button>`:''}
    <div id="truck" class="card"><h2>Mi grúa</h2><div class="sk-group" aria-busy="true" aria-label="Cargando"><i class="sk"></i></div></div>
    <div class="card"><h2>Mi cuenta</h2><div class="row"><span>${esc(profile.full_name)}</span></div><p class="hint">${esc(user.email)}</p>
      <button class="btn block" type="button" id="logout">${icon('log-out')} Cerrar sesión</button></div>`,'mas');
  app.querySelector('[data-to]').onclick=()=>go('clientes');
  document.getElementById('inst')?.addEventListener('click',()=>window.SoloPWA.open());
  document.getElementById('logout').onclick=async()=>{await db.auth.signOut();location.hash='';};
  const {data:t}=await db.from('solo_trucks').select('*').order('created_at').limit(1).maybeSingle();
  const box=document.getElementById('truck');if(box)box.innerHTML='<h2>Mi grúa</h2>'+(t?`<div class="row"><b class="num">${esc(t.plate)}</b><span class="sub">${esc([t.brand,t.model].filter(Boolean).join(' '))}</span></div>${t.km?'<p class="hint">'+Number(t.km).toLocaleString('es-AR')+' km</p>':''}`:'<p class="hint">Sin grúa cargada.</p>');
}
function renderPronto(v){
  const txt={servicios:['Servicios','Acá vas a ver los servicios del mes, cargar uno nuevo y hacer su remito con firma.'],gastos:['Gastos','Acá vas a cargar combustible, taller y peajes en dos toques, y tus gastos fijos repartidos por mes.']}[v]||['AuxiliOS Solo',''];
  shell(`<h1>${txt[0]}</h1><div class="empty"><b>Llega en la próxima entrega</b><span>${txt[1]}</span></div>`,v);
}

window.SoloCore={views,shell,go,toast,esc,money,num,isoDate,monthName,errText,icon,
  get db(){return db;},get user(){return user;},get profile(){return profile;},
  get month(){return month;},set month(d){month=d;}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
