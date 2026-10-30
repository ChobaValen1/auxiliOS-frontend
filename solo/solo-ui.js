// AuxiliOS Solo · capa de UI: validación de formatos, máscaras, estados de carga y motion.
// Se aplica sola sobre las pantallas (por id de campo), así cada pantalla no repite estas reglas.
(function(){
'use strict';
const reduced=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const digits=v=>String(v||'').replace(/\D/g,'');

/* ── Validadores (formatos de Argentina) ──────────────── */
function plateNorm(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
const PLATES=[/^[A-Z]{2}\d{3}[A-Z]{2}$/,/^[A-Z]{3}\d{3}$/,/^[A-Z]\d{3}[A-Z]{3}$/,/^\d{3}[A-Z]{3}$/];
function plateFmt(v){const p=plateNorm(v);
  if(/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p))return p.slice(0,2)+' '+p.slice(2,5)+' '+p.slice(5);
  if(/^[A-Z]{3}\d{3}$/.test(p))return p.slice(0,3)+' '+p.slice(3);
  if(/^[A-Z]\d{3}[A-Z]{3}$/.test(p))return p[0]+' '+p.slice(1,4)+' '+p.slice(4);
  if(/^\d{3}[A-Z]{3}$/.test(p))return p.slice(0,3)+' '+p.slice(3);
  return String(v||'').toUpperCase().trim();}
function cuitOk(d){if(!/^\d{11}$/.test(d)||!/^(20|23|24|25|26|27|30|33|34)/.test(d))return false;
  const w=[5,4,3,2,7,6,5,4,3,2];let s=0;for(let i=0;i<10;i++)s+=Number(d[i])*w[i];let c=11-(s%11);if(c===11)c=0;if(c===10)return false;return c===Number(d[10]);}
const cuitFmt=d=>d.slice(0,2)+'-'+d.slice(2,10)+'-'+d.slice(10);
const dniFmt=d=>Number(d).toLocaleString('es-AR');
function parseNum(v){const s=String(v??'').trim();if(!s)return NaN;return Number(s.replace(/\./g,'').replace(',','.'));}
function moneyFmt(v){const s=String(v??'');const [i,dec]=s.replace(/[^\d,]/g,'').split(',');const int=(i||'').replace(/^0+(?=\d)/,'');
  const g=int?Number(int).toLocaleString('es-AR'):'';return dec!==undefined?(g||'0')+','+dec.slice(0,2):g;}

const RULES={
  name:{test:v=>v.trim().length>=2&&v.trim().length<=120,msg:'Escribí al menos 2 letras.'},
  text:{test:v=>v.length<=160,msg:'Es demasiado largo.'},
  email:{test:v=>/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim()),msg:'Revisá el email: tiene que ser como nombre@correo.com.'},
  pass:{test:v=>v.length>=6,msg:'La contraseña tiene que tener al menos 6 caracteres.'},
  phone:{test:v=>{const d=digits(v);return d.length>=8&&d.length<=13;},msg:'El teléfono tiene que tener entre 8 y 13 números, con característica.'},
  plate:{test:v=>PLATES.some(r=>r.test(plateNorm(v))),msg:'Patente inválida. Ej.: AB 123 CD o ABC 123.',fmt:plateFmt},
  doc:{test:v=>{const d=digits(v);return (d.length>=7&&d.length<=8)||cuitOk(d);},msg:'Poné un DNI (7 u 8 números) o un CUIT válido (11 números).',
    fmt:v=>{const d=digits(v);return d.length===11&&cuitOk(d)?cuitFmt(d):d.length>=7&&d.length<=8?dniFmt(d):v;}},
  money:{test:v=>{const n=parseNum(v);return Number.isFinite(n)&&n>=0&&n<=100000000;},msg:'Poné un monto válido, solo números.',mask:moneyFmt},
  moneypos:{test:v=>{const n=parseNum(v);return Number.isFinite(n)&&n>0&&n<=100000000;},msg:'Poné un monto mayor a cero.',mask:moneyFmt},
  km:{test:v=>{const n=parseNum(v);return Number.isFinite(n)&&n>=0&&n<=3000;},msg:'Los km tienen que estar entre 0 y 3.000.',mask:moneyFmt},
  odo:{test:v=>{const n=parseNum(v);return Number.isFinite(n)&&n>=0&&n<=3000000;},msg:'Revisá los km de la grúa.',mask:moneyFmt},
  days:{test:v=>/^\d{1,3}$/.test(v.trim())&&Number(v)<=365,msg:'Entre 0 y 365 días.'},
  when:{test:v=>{const t=new Date(v).getTime();return Number.isFinite(t)&&t<=Date.now()+864e5&&t>=Date.now()-400*864e5;},msg:'Revisá la fecha: no puede ser de más de un año atrás ni de días futuros.'},
  date:{test:v=>/^\d{4}-\d{2}-\d{2}$/.test(v),msg:'Elegí una fecha.'}
};
// Qué regla lleva cada campo. «!» = obligatorio.
const BY_ID={'a-name':'name!','a-email':'email!','a-pass':'pass!','o-name':'name!','o-biz':'text','o-phone':'phone','o-plate':'plate!','o-brand':'text','o-model':'text','o-km':'odo',
  'o-client':'name','o-days':'days!','c-name':'name!','c-days':'days!','d-days':'days!','t-name':'name!',
  's-km':'km','s-tolls':'money','s-other':'money','s-manual':'moneypos','s-plate':'plate','s-mm':'text','s-orig':'text','s-dest':'text','s-order':'text','s-cname':'text','s-cdoc':'doc','s-cphone':'phone','s-date':'when!',
  'p1a':'money','sn':'name!','sd':'doc','obs':'text','e-amount':'moneypos!','e-date':'date!',
  'n-manual':'money','r-date':'when!','r-order':'text','r-plate':'plate!','r-mm':'text','r-orig':'name!','r-dest':'name!','r-km':'km','r-cname':'name!','r-cdoc':'doc','r-cphone':'phone',
  'r-tolls':'money','r-exc':'money','r-wait':'money','r-other':'money','r-p1a':'money','r-p2a':'money','r-obs':'text','r-sn':'name!','r-sd':'doc'};
function ruleFor(el){if(el.dataset.v)return el.dataset.v;const id=el.id||'';if(BY_ID[id])return BY_ID[id];
  if(/^[bp]-/.test(id))return 'money';if(/^k-/.test(id))return 'km';if(/^v-/.test(id))return 'date!';return '';}

/* ── Campos: máscara, error en línea y accesibilidad ──── */
function errEl(el){let e=document.getElementById(el.id+'-msg');if(!e){e=document.createElement('span');e.id=el.id+'-msg';e.className='field-err';e.setAttribute('role','alert');e.hidden=true;
  (el.closest('.field')||el.parentElement).appendChild(e);}return e;}
function setError(el,msg){const e=errEl(el);el.setAttribute('aria-invalid',msg?'true':'false');
  const ids=new Set((el.getAttribute('aria-describedby')||'').split(' ').filter(Boolean));msg?ids.add(e.id):ids.delete(e.id);
  ids.size?el.setAttribute('aria-describedby',[...ids].join(' ')):el.removeAttribute('aria-describedby');e.textContent=msg||'';e.hidden=!msg;}
function check(el,{force}={}){const spec=ruleFor(el);if(!spec)return true;const req=spec.endsWith('!'),r=RULES[spec.replace('!','')];const v=el.value;
  if(!v.trim()){if(req&&force){setError(el,'Este dato es obligatorio.');return false;}setError(el,'');return true;}
  if(r&&!r.test(v)){if(force||el.dataset.touched)setError(el,r.msg);return false;}
  if(r?.fmt&&document.activeElement!==el)el.value=r.fmt(v);setError(el,'');return true;}
function attach(el){if(el.dataset.uiReady)return;const spec=ruleFor(el);if(!spec)return;el.dataset.uiReady='1';
  const r=RULES[spec.replace('!','')];
  if(spec.endsWith('!')){el.required=true;el.setAttribute('aria-required','true');}
  if(r?.mask){// Valores que vienen de la base ("1150.5") se muestran en formato local ("1.150,5").
    if(/^\d+\.\d+$/.test(el.value)||/^\d+$/.test(el.value))el.value=r.mask(String(Number(el.value)).replace('.',','));
    el.inputMode=spec.startsWith('km')||spec==='odo'?'decimal':'decimal';}
  if(spec.startsWith('plate'))el.autocapitalize='characters';
}
document.addEventListener('input',e=>{const el=e.target;if(!(el instanceof HTMLInputElement))return;const spec=ruleFor(el);if(!spec)return;
  const r=RULES[spec.replace('!','')];
  if(r?.mask){const before=el.value,pos=el.selectionStart,tail=before.length-pos;el.value=r.mask(before);const p=Math.max(0,el.value.length-tail);try{el.setSelectionRange(p,p);}catch(x){}}
  if(el.getAttribute('aria-invalid')==='true')check(el);},true);
document.addEventListener('blur',e=>{const el=e.target;if(el instanceof HTMLInputElement&&ruleFor(el)){el.dataset.touched='1';check(el);}},true);
document.addEventListener('change',e=>{const el=e.target;if(el instanceof HTMLInputElement&&ruleFor(el)){el.dataset.touched='1';check(el);}},true);

/* ── Formularios: validar antes de guardar y no guardar dos veces ── */
function shake(el){if(reduced()||!el.animate)return;el.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(-3px)'},{transform:'translateX(0)'}],{duration:280,easing:'ease-out'});}
function validateForm(form){let first=null;
  form.querySelectorAll('input').forEach(el=>{if(el.closest('[hidden]'))return;if(!check(el,{force:true})&&!first)first=el;});
  if(first){const det=first.closest('details');if(det)det.open=true;first.focus({preventScroll:true});first.scrollIntoView({block:'center',behavior:reduced()?'auto':'smooth'});shake(first);haptic([20,40,20]);return false;}
  return true;}
function setBusy(form,on){const b=form.querySelector('button[type=submit]');if(!b)return;
  if(on){form.dataset.busy='1';b.dataset.label=b.innerHTML;b.setAttribute('aria-busy','true');b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span>'+(b.dataset.busyText||'Guardando…');}
  else if(form.dataset.busy){delete form.dataset.busy;b.removeAttribute('aria-busy');b.disabled=false;if(b.dataset.label)b.innerHTML=b.dataset.label;}}
document.addEventListener('submit',e=>{const form=e.target;
  if(form.dataset.busy){e.preventDefault();e.stopImmediatePropagation();return;}
  if(!validateForm(form)){e.preventDefault();e.stopImmediatePropagation();return;}
  // Algunos formularios manejan su propio estado (ingreso); el resto queda «guardando» hasta que haya respuesta.
  if(form.id!=='auth')setBusy(form,true);
},true);
// La respuesta llega como aviso (toast), como error visible en el formulario o como una pantalla nueva.
const free=()=>document.querySelectorAll('form[data-busy]').forEach(f=>setBusy(f,false));
new MutationObserver(ms=>{for(const m of ms){
  if(m.type==='attributes'&&m.target.classList?.contains('err')&&!m.target.hidden){const f=m.target.closest('form');if(f)setBusy(f,false);}
  if(m.target.id==='toast'&&m.type!=='attributes')free();
  m.addedNodes&&m.addedNodes.forEach(n=>{if(n.nodeType!==1)return;
    n.matches?.('input')&&attach(n);n.querySelectorAll?.('input').forEach(attach);
    stagger(n);countAll(n);focusView(n);});
}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});

/* ── Motion ───────────────────────────────────────────── */
// Listas: cada elemento entra un poco después del anterior.
const LISTS='.stack,.rates';
function enter(c,i){c.style.setProperty('--i',Math.min(i,10));c.classList.add('enter');}
function stagger(n){const p=n.parentElement;if(p&&p.matches(LISTS))enter(n,[...p.children].indexOf(n));
  n.querySelectorAll?.(LISTS).forEach(list=>[...list.children].forEach(enter));}
// Números del Inicio: cuentan desde 0 hasta el valor.
function countAll(root){root.querySelectorAll?.('[data-count]').forEach(el=>{if(el.dataset.counted)return;el.dataset.counted='1';countUp(el,Number(el.dataset.count)||0);});}
function countUp(el,to){const fmt=n=>(n<0?'− ':'')+'$ '+Math.round(Math.abs(n)).toLocaleString('es-AR');
  if(reduced()||!to){el.textContent=fmt(to);return;}const t0=performance.now(),d=650;
  const step=t=>{const k=Math.min(1,(t-t0)/d),e=1-Math.pow(1-k,3);el.textContent=fmt(to*e);if(k<1)requestAnimationFrame(step);};requestAnimationFrame(step);}
// Al cambiar de pantalla: arriba de todo y foco en el título, para lectores de pantalla.
let lastView=null;
function focusView(n){if(!n.classList?.contains('view'))return;const key=location.hash+'|'+(n.querySelector('h1')?.textContent||'');
  if(key===lastView)return;lastView=key;const h=n.querySelector('h1');window.scrollTo({top:0});if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
function haptic(p){try{navigator.vibrate&&navigator.vibrate(p);}catch(e){}}
function success(){haptic(12);}

/* ── Sin conexión ─────────────────────────────────────── */
function net(){let b=document.getElementById('offline');if(!b){b=document.createElement('div');b.id='offline';b.className='offline';b.setAttribute('role','status');b.textContent='Sin conexión. Lo que cargues se va a guardar cuando vuelva la señal.';document.body.appendChild(b);}b.hidden=navigator.onLine;}
addEventListener('online',net);addEventListener('offline',net);document.addEventListener('DOMContentLoaded',net);

// Esqueletos de carga para usar en lugar de «Cargando…».
const SKELETON='<div class="sk-group" aria-busy="true" aria-label="Cargando"><i class="sk"></i><i class="sk"></i><i class="sk short"></i></div>';
window.SoloUI={RULES,BY_ID,check,validateForm,setBusy,countUp,haptic,success,plateFmt,parseNum,moneyFmt,cuitOk,SKELETON};
})();
