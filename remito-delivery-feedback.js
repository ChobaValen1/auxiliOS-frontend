/* Delivery feedback never decides whether a remito was persisted. Save paths report it. */
(()=>{'use strict';
let latest=null;
function begin(){document.getElementById('remito-delivery-error')?.remove();document.getElementById('remito-delivery-result')?.remove();latest=null;}
function failed(){
 const footer=document.querySelector('#remitos-nuevo .rem-wizard-footer');if(!footer)return;
 begin();const panel=document.createElement('section');panel.id='remito-delivery-error';panel.className='remito-delivery is-error';panel.setAttribute('role','alert');
 const title=document.createElement('strong');title.textContent='No se pudo enviar el remito';
 const text=document.createElement('p');text.textContent='Tus datos, fotos y firma siguen en este formulario. Podés volver a intentar sin completarlo otra vez.';
 const retry=document.createElement('button');retry.type='button';retry.textContent='Reintentar';retry.className='remito-delivery-retry';retry.addEventListener('click',()=>{if(retry.disabled)return;retry.disabled=true;void window.finalizarRemito();});
 panel.append(title,text,retry);footer.prepend(panel);retry.focus({preventScroll:true});
}
function complete(outcome){
 if(!outcome||!['sent','queued'].includes(outcome.status))return;
 begin();latest=outcome;const root=document.getElementById('screen-remitos');if(!root)return;
 let panel=document.getElementById('remito-delivery-result');if(!panel){panel=document.createElement('section');panel.id='remito-delivery-result';root.prepend(panel);}
 panel.className='remito-delivery '+(outcome.status==='sent'?'is-sent':'is-queued');panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');panel.replaceChildren();
 const title=document.createElement('strong');title.textContent=outcome.status==='sent'?'Remito enviado':'Guardado en el teléfono, pendiente de sincronizar';
 const text=document.createElement('p');text.textContent=(outcome.number?outcome.number+' · ':'')+(outcome.status==='sent'?'El servidor confirmó la recepción.':'Se enviará automáticamente cuando vuelva la conexión. No hace falta reenviarlo.');panel.append(title,text);
}
function synced(number){if(latest?.status==='queued'&&latest.number===number)complete({...latest,status:'sent'});}
window.AuxiliosRemitoDelivery={begin,failed,complete,synced};
})();
