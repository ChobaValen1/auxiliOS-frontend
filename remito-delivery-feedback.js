/* Failed-send retry keeps the existing remito form and signature mounted. */
(()=>{'use strict';
function begin(){document.getElementById('remito-delivery-error')?.remove();}
function failed(){
 const footer=document.querySelector('#remitos-nuevo .rem-wizard-footer');if(!footer)return;
 begin();const panel=document.createElement('section');panel.id='remito-delivery-error';panel.className='remito-delivery is-error';panel.setAttribute('role','alert');
 const title=document.createElement('strong');title.textContent='No se pudo enviar el remito';
 const text=document.createElement('p');text.textContent='Tus datos, fotos y firma siguen en este formulario. Podés volver a intentar sin completarlo otra vez.';
 const retry=document.createElement('button');retry.type='button';retry.textContent='Reintentar';retry.className='remito-delivery-retry';retry.addEventListener('click',()=>{if(retry.disabled)return;retry.disabled=true;void window.finalizarRemito();});
 panel.append(title,text,retry);footer.prepend(panel);retry.focus({preventScroll:true});
}
window.AuxiliosRemitoDelivery={begin,failed};
})();
