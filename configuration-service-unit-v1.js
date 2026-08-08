/* AuxiliOS · Configuración · unidad KM */
(()=>{'use strict';
function install(){
 const select=document.getElementById('crs-unit');
 if(!select||select.querySelector('option[value="km"]'))return Boolean(select);
 const option=document.createElement('option');option.value='km';option.textContent='Por km';
 const unit=select.querySelector('option[value="unit"]');
 if(unit)select.insertBefore(option,unit);else select.appendChild(option);
 return true;
}
function init(){let tries=0;const timer=setInterval(()=>{if(install()||++tries>80)clearInterval(timer);},250);window.addEventListener('auxilios:profile-ready',install);window.addEventListener('auxilios:features-ready',install);}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
