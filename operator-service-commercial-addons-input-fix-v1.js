/* AuxiliOS · Servicios · evita re-render por cada tecla en campos numéricos comerciales */
(()=>{'use strict';
window.addEventListener('input',event=>{
  const target=event.target;
  if(!target?.closest?.('.osca-panel'))return;
  const tollNumeric=['quantity','customer_unit_amount'].includes(target.dataset?.caField);
  const excessNumeric=['quantity','unit_amount'].includes(target.dataset?.caExcessField);
  if(tollNumeric||excessNumeric)event.stopPropagation();
},true);
})();
