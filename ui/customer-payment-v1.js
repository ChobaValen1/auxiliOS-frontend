/* AuxiliOS · Cobro al cliente (React)
   Un medio principal para el TOTAL que paga el cliente (peajes a su cargo + excedentes que cobra la Empresa) y,
   si pagó con dos medios, el segundo medio con su importe. Lo que queda en el principal se calcula solo.
   Lo usan el formulario del operador y el remito del chofer:
     AuxiliosCustomerPayment.render(el,{total,breakdown,value,onChange,allowToDefine,disabled,showErrors,hint})
   value = {primary, secondary, secondary_amount}. El componente no guarda nada: avisa con onChange. */
(()=>{'use strict';
const METHODS=[['cash','Efectivo'],['transfer','Transferencia'],['card','Tarjeta'],['mercado_pago','Mercado Pago'],['other','Otro']];
const TO_DEFINE=['to_define','A definir'];
const NOT_COLLECTED=['not_collected','No cobrado'];
/* Medios que no admiten un segundo medio: el cobro queda en uno solo. */
const SINGLE=new Set([TO_DEFINE[0],NOT_COLLECTED[0]]);
const label=v=>(v===TO_DEFINE[0]?TO_DEFINE[1]:v===NOT_COLLECTED[0]?NOT_COLLECTED[1]:METHODS.find(([k])=>k===v)?.[1])||'';
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:Number.isInteger(num(v))?0:2,maximumFractionDigits:2}).format(num(v));
/* "4.000", "4000,50" o "4000.5" → número. */
function parseAmount(text){const raw=String(text??'').trim().replace(/\s|\$/g,'');if(!raw)return NaN;const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):(/^\d{1,3}(\.\d{3})+$/.test(raw)?raw.replace(/\./g,''):raw);const n=Number(normalized);return Number.isFinite(n)?Math.round(n*100)/100:NaN;}
/* Validación compartida (la usan también los formularios para no dejar guardar). */
function validate(value,total,{allowToDefine=false}={}){const v=value||{},errors={};if(!(total>0))return errors;if(!v.primary)errors.primary='Elegí el medio de pago.';else if(v.primary===TO_DEFINE[0]&&!allowToDefine)errors.primary='Elegí cómo pagó el cliente.';if(v.secondary&&SINGLE.has(v.primary))errors.secondary='Con este medio no se suma un segundo medio.';if(v.secondary){const amount=num(v.secondary_amount);if(v.secondary===v.primary)errors.secondary='Tiene que ser distinto del principal.';if(!(amount>0))errors.amount='Indicá cuánto pagó con este medio.';else if(amount>=total)errors.amount=`Tiene que ser menor al total (${money(total)}).`;}return errors;}

function component({React,html}){
  const {useState,useEffect,useRef,useId}=React;
  function Amount({value,className}){/* El número "late" cuando cambia: se nota que se recalculó. */return html`<b key=${String(value)} className=${'axcp-amount '+(className||'')}>${money(value)}</b>`;}
  function Chips({name,options,value,onPick,disabled,invalid,describedBy}){
    const refs=useRef([]);
    const idx=Math.max(0,options.findIndex(([k])=>k===value));
    function onKey(e,i){const keys={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1};if(!(e.key in keys))return;e.preventDefault();const n=(i+keys[e.key]+options.length)%options.length;refs.current[n]?.focus();onPick(options[n][0]);}
    return html`<div className=${'axcp-chips'+(invalid?' is-invalid':'')} role="radiogroup" aria-label=${name} aria-describedby=${describedBy||undefined}>
      ${options.map(([k,l],i)=>html`<button key=${k} type="button" role="radio" ref=${el=>refs.current[i]=el} aria-checked=${value===k} tabIndex=${i===idx?0:-1} disabled=${disabled} className=${'axcp-chip'+(value===k?' is-on':'')+(k===TO_DEFINE[0]?' is-define':'')} onClick=${()=>onPick(k)} onKeyDown=${e=>onKey(e,i)}>${l}</button>`)}
    </div>`;
  }
  function CustomerPayment(props){
    const {total=0,breakdown=[],value={},onChange,allowToDefine=false,allowNotCollected=false,compact=false,pendingTotal=false,title='Cobro al cliente',question='',disabled=false,showErrors=false,hint=''}=props;
    const v={primary:value.primary||'',secondary:value.secondary||'',secondary_amount:value.secondary_amount??''};
    const two=!!v.secondary;
    const [text,setText]=useState(v.secondary_amount===''||v.secondary_amount==null?'':String(v.secondary_amount).replace('.',','));
    const [touched,setTouched]=useState({});
    const uid=useId();
    useEffect(()=>{const n=parseAmount(text),incoming=num(v.secondary_amount);if(!two){if(text)setText('');return;}if(v.secondary_amount!==''&&(!Number.isFinite(n)||Math.abs(n-incoming)>.004))setText(String(incoming).replace('.',','));},[v.secondary_amount,two]);
    const errors=validate(v,total,{allowToDefine});
    const show=k=>errors[k]&&(showErrors||touched[k]);
    const secondaryAmount=two?Math.min(total,Math.max(0,num(v.secondary_amount))):0;
    const rest=Math.max(0,Math.round((total-secondaryAmount)*100)/100);
    const canSplit=!!v.primary&&!SINGLE.has(v.primary)&&total>0;
    const emit=next=>onChange?.({...v,...next});
    const primaryOptions=[...METHODS,...(allowNotCollected?[NOT_COLLECTED]:[]),...(allowToDefine?[TO_DEFINE]:[])];
    const secondaryOptions=METHODS.filter(([k])=>k!==v.primary);
    function pickPrimary(k){setTouched(t=>({...t,primary:true}));if(k===v.secondary||SINGLE.has(k)){setText('');return emit({primary:k,secondary:'',secondary_amount:''});}emit({primary:k});}
    function toggleTwo(){if(!canSplit||disabled)return;if(two){setText('');emit({secondary:'',secondary_amount:''});return;}const first=secondaryOptions[0]?.[0]||'';emit({secondary:first,secondary_amount:''});requestAnimationFrame(()=>document.getElementById(uid+'-amount')?.focus({preventScroll:true}));}
    function onAmount(e){const t=e.target.value;setText(t);const n=parseAmount(t);emit({secondary_amount:Number.isFinite(n)?n:''});}
    const pct=total>0?Math.min(100,Math.max(0,secondaryAmount/total*100)):0;
    if(!(total>0)&&!pendingTotal)return html`<section className=${'axcp is-empty'+(compact?' is-compact':'')} aria-label=${title}><header className="axcp-head"><div><span className="axcp-kicker">${title}</span><b className="axcp-amount">${money(0)}</b></div></header><p className="axcp-empty">No hay peajes ni excedentes a cargo del cliente.</p></section>`;
    return html`<section className=${'axcp'+(compact?' is-compact':'')+(disabled?' is-disabled':'')} aria-labelledby=${uid+'-title'}>
      <header className="axcp-head">
        <div><span className="axcp-kicker" id=${uid+'-title'}>${title}</span><${Amount} value=${total} className="axcp-total"/></div>
        ${breakdown.filter(x=>num(x.amount)>0).length?html`<ul className="axcp-breakdown">${breakdown.filter(x=>num(x.amount)>0).map(x=>html`<li key=${x.label}><span>${x.label}</span><b>${money(x.amount)}</b></li>`)}</ul>`:null}
      </header>
      <div className="axcp-field">
        <span className="axcp-label" id=${uid+'-primary'}>${two?'Medio principal':(question||'Medio de pago')}</span>
        <${Chips} name=${two?'Medio principal':'Medio de pago'} options=${primaryOptions} value=${v.primary} onPick=${pickPrimary} disabled=${disabled} invalid=${!!show('primary')} describedBy=${show('primary')?uid+'-e1':''}/>
        ${v.primary===TO_DEFINE[0]?html`<p className="axcp-note">El chofer elige cómo pagó el cliente al hacer el remito.</p>`:null}
        ${show('primary')?html`<p className="axcp-error" id=${uid+'-e1'} role="alert">${errors.primary}</p>`:null}
      </div>
      <div className="axcp-switch-row">
        <button type="button" role="switch" aria-checked=${two} className=${'axcp-switch'+(two?' is-on':'')} disabled=${disabled||!canSplit} onClick=${toggleTwo}><span className="axcp-switch-track" aria-hidden="true"><span className="axcp-switch-thumb"></span></span><span>Pagó con dos medios</span></button>
        ${!canSplit&&!disabled?html`<small>${v.primary===TO_DEFINE[0]?'Lo define el chofer.':v.primary===NOT_COLLECTED[0]?'No se cobró nada.':'Elegí primero el medio principal.'}</small>`:null}
      </div>
      <div className="axcp-collapse" data-open=${two} aria-hidden=${!two}>
        <div className="axcp-collapse-inner">
          <div className="axcp-field">
            <span className="axcp-label">Segundo medio</span>
            <${Chips} name="Segundo medio" options=${secondaryOptions} value=${v.secondary} onPick=${k=>emit({secondary:k})} disabled=${disabled||!two} invalid=${!!show('secondary')}/>
            ${show('secondary')?html`<p className="axcp-error" role="alert">${errors.secondary}</p>`:null}
          </div>
          <div className="axcp-field axcp-amount-field">
            <label className="axcp-label" htmlFor=${uid+'-amount'}>¿Cuánto pagó con ${label(v.secondary)||'el segundo medio'}?</label>
            <div className=${'axcp-money'+(show('amount')?' is-invalid':'')}><span aria-hidden="true">$</span><input id=${uid+'-amount'} type="text" inputMode="decimal" autoComplete="off" placeholder="0" value=${text} disabled=${disabled||!two} aria-invalid=${!!show('amount')} aria-describedby=${uid+'-rest'} onChange=${onAmount} onBlur=${()=>setTouched(t=>({...t,amount:true}))}/></div>
            ${show('amount')?html`<p className="axcp-error" role="alert">${errors.amount}</p>`:null}
          </div>
          <div className="axcp-split" id=${uid+'-rest'} aria-live="polite">
            <div className="axcp-bar" aria-hidden="true"><span className="axcp-bar-primary" style=${{width:(100-pct)+'%'}}></span><span className="axcp-bar-secondary" style=${{width:pct+'%'}}></span></div>
            <div className="axcp-split-rows">
              <div><i className="axcp-dot is-primary" aria-hidden="true"></i><span>${label(v.primary)}</span><${Amount} value=${rest}/></div>
              <div><i className="axcp-dot is-secondary" aria-hidden="true"></i><span>${label(v.secondary)||'Segundo medio'}</span><${Amount} value=${secondaryAmount}/></div>
            </div>
          </div>
        </div>
      </div>
      ${hint?html`<p className="axcp-hint">${hint}</p>`:null}
    </section>`;
  }
  return CustomerPayment;
}

let Comp=null;
function placeholder(el){if(!el.firstChild)el.innerHTML='<section class="axcp is-loading" aria-busy="true"><div class="axcp-skeleton"></div><div class="axcp-skeleton short"></div></section>';}
function render(el,props){if(!el)return Promise.resolve();placeholder(el);return window.AuxiliosReact.load().then(lib=>{if(!Comp)Comp=component(lib);if(!el.isConnected)return;if(!el._axcpRoot){el.innerHTML='';el._axcpRoot=lib.ReactDOM.createRoot(el);}el._axcpRoot.render(lib.React.createElement(Comp,props));}).catch(error=>{console.error('[cobro al cliente]',error);el.innerHTML='<p class="axcp-error" role="alert">No se pudo cargar el cobro al cliente. Recargá la página.</p>';});}
function unmount(el){if(el?._axcpRoot){el._axcpRoot.unmount();el._axcpRoot=null;}}
window.AuxiliosCustomerPayment={render,unmount,validate,parseAmount,label,METHODS,TO_DEFINE,NOT_COLLECTED};
})();
