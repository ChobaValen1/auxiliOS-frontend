/* AuxiliOS · Campos de fecha en DD/MM/AA v1
   Los <input type="date|datetime-local|month"> nativos muestran el formato del
   idioma del navegador (p. ej. 09/01/2026 en un navegador en inglés). En toda
   la app las fechas se escriben y se leen como DD/MM/AA.

   Cada campo nativo se queda en el DOM con su id, su valor ISO y sus eventos:
   el código existente lo sigue leyendo y escribiendo igual (input.value,
   onchange, oninput). Encima se muestra un campo de texto DD/MM/AA que:
   · al escribir una fecha completa y válida, actualiza el nativo y dispara
     'input' y 'change' sobre él;
   · se actualiza solo cuando el código escribe input.value o cuando se elige
     en el calendario nativo (botón 📅);
   · copia disabled / readonly / required y se oculta con el nativo.
   Los campos que aparecen después (modales, pantallas renderizadas) se toman
   con un MutationObserver. */
(()=>{'use strict';
if(window.AuxDateInputs)return;
const TYPES=new Set(['date','datetime-local','month']);
const SELECTOR='input[type="date"],input[type="datetime-local"],input[type="month"]';
const pad=n=>String(n).padStart(2,'0');
const nativeValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
const PLACEHOLDER={date:'DD/MM/AA','datetime-local':'DD/MM/AA HH:MM',month:'MM/AA'};
const MAX_DIGITS={date:6,'datetime-local':10,month:4};

function toText(iso,type){
  const v=String(iso||'');
  if(type==='month'){const m=v.match(/^(\d{4})-(\d{2})$/);return m?`${m[2]}/${m[1].slice(2)}`:'';}
  const m=v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);if(!m)return'';
  const date=`${m[3]}/${m[2]}/${m[1].slice(2)}`;
  return type==='datetime-local'?(m[4]?`${date} ${m[4]}:${m[5]}`:date):date;
}
const fullYear=y=>y.length===2?2000+Number(y):Number(y);
/* '' si está vacío, null si no es una fecha válida. Acepta AA o AAAA. */
function toIso(text,type){
  const v=String(text||'').trim();if(!v)return'';
  if(type==='month'){const m=v.match(/^(\d{1,2})[\/.-](\d{2}|\d{4})$/);if(!m)return null;const mo=Number(m[1]);if(mo<1||mo>12)return null;return`${fullYear(m[2])}-${pad(mo)}`;}
  const m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?$/);if(!m)return null;
  const d=Number(m[1]),mo=Number(m[2]),y=fullYear(m[3]),dt=new Date(y,mo-1,d);
  if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)return null;
  const date=`${y}-${pad(mo)}-${pad(d)}`;
  if(type!=='datetime-local')return date;
  if(m[4]==null)return null;const h=Number(m[4]),mi=Number(m[5]);if(h>23||mi>59)return null;
  return`${date}T${pad(h)}:${pad(mi)}`;
}
/* Solo dígitos → inserta las barras (y el espacio y ':' de la hora). */
function mask(text,type){
  const digits=String(text||'').replace(/\D/g,'').slice(0,MAX_DIGITS[type]);
  if(type==='month')return digits.replace(/^(\d{2})(\d)/,'$1/$2');
  let out=digits.replace(/^(\d{2})(\d)/,'$1/$2').replace(/^(\d{2}\/\d{2})(\d)/,'$1/$2');
  if(type==='datetime-local')out=out.replace(/^(\d{2}\/\d{2}\/\d{2})(\d)/,'$1 $2').replace(/^(\d{2}\/\d{2}\/\d{2} \d{2})(\d)/,'$1:$2');
  return out;
}
function fire(el,type){el.dispatchEvent(new Event(type,{bubbles:true}));}

function enhance(input){
  if(!input||input.dataset.auxDate||!TYPES.has(input.type))return;
  if(input.closest('[data-aux-date-skip]'))return;
  const type=input.type;input.dataset.auxDate='1';
  const wrap=document.createElement('span');wrap.className='aux-date-wrap';
  const proxy=document.createElement('input');
  proxy.type='text';proxy.inputMode='numeric';proxy.autocomplete='off';
  proxy.className=`${input.className||''} aux-date-proxy`.trim();
  proxy.placeholder=PLACEHOLDER[type];proxy.maxLength=PLACEHOLDER[type].length+2;
  if(input.getAttribute('style'))proxy.setAttribute('style',input.getAttribute('style'));
  const label=input.getAttribute('aria-label')||input.closest('label')?.textContent?.trim()||input.labels?.[0]?.textContent?.trim();
  if(label)proxy.setAttribute('aria-label',label.slice(0,80));
  const pick=document.createElement('button');pick.type='button';pick.className='aux-date-pick';pick.tabIndex=-1;pick.title='Elegir en el calendario';pick.setAttribute('aria-label','Abrir calendario');pick.textContent='📅';
  input.parentNode.insertBefore(wrap,input);wrap.append(proxy,pick,input);
  input.classList.add('aux-date-native');input.tabIndex=-1;input.setAttribute('aria-hidden','true');

  const show=()=>{const t=toText(nativeValue.get.call(input),type);if(document.activeElement!==proxy||!proxy.value||toIso(proxy.value,type)!==nativeValue.get.call(input))proxy.value=t;proxy.classList.remove('is-invalid');proxy.setCustomValidity('');};
  const sync=()=>{proxy.disabled=input.disabled;proxy.readOnly=input.readOnly;proxy.required=input.required;pick.disabled=input.disabled||input.readOnly;wrap.hidden=input.hidden||input.style.display==='none';};
  Object.defineProperty(input,'value',{configurable:true,get(){return nativeValue.get.call(this);},set(v){nativeValue.set.call(this,v);show();}});
  const nativeFocus=input.focus.bind(input);input.focus=opts=>proxy.focus(opts);

  const commit=(final)=>{
    const iso=toIso(proxy.value,type);
    if(iso===null){if(final){proxy.classList.add('is-invalid');proxy.setCustomValidity(`Escribí la fecha como ${PLACEHOLDER[type]}`);}return;}
    proxy.classList.remove('is-invalid');proxy.setCustomValidity('');
    if(iso===nativeValue.get.call(input)){if(final)show();return;}
    nativeValue.set.call(input,iso);fire(input,'input');fire(input,'change');
  };
  proxy.addEventListener('input',ev=>{
    if(ev.inputType&&!ev.inputType.startsWith('delete')){const next=mask(proxy.value,type);if(next!==proxy.value)proxy.value=next;}
    const complete=proxy.value.replace(/\D/g,'').length===MAX_DIGITS[type];
    if(complete||!proxy.value)commit(false);
  });
  proxy.addEventListener('change',()=>commit(true));
  proxy.addEventListener('blur',()=>commit(true));
  proxy.addEventListener('keydown',ev=>{if(ev.key==='Enter')commit(true);});
  input.addEventListener('input',show);input.addEventListener('change',show);
  pick.addEventListener('click',()=>{if(input.disabled||input.readOnly)return;try{if(typeof input.showPicker==='function'){input.classList.add('is-picking');input.showPicker();setTimeout(()=>input.classList.remove('is-picking'),0);return;}}catch(_){input.classList.remove('is-picking');}nativeFocus();});
  new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['disabled','readonly','required','hidden','style','min','max']});
  /* Si otro código mueve el nativo (p. ej. el remito móvil lo pasa a un
     contenedor oculto), el campo de texto se va con él. Si lo borra, también. */
  new MutationObserver(()=>{if(input.parentNode===wrap)return;if(!input.isConnected){wrap.remove();return;}input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);}).observe(wrap,{childList:true});
  sync();show();
}
function scan(root){if(!root)return;if(root.matches?.(SELECTOR))enhance(root);root.querySelectorAll?.(SELECTOR).forEach(enhance);}
function start(){
  scan(document.body);
  new MutationObserver(list=>{for(const m of list)for(const node of m.addedNodes)if(node.nodeType===1)scan(node);}).observe(document.body,{childList:true,subtree:true});
}
window.AuxDateInputs={enhance,scan,toText,toIso,mask};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
