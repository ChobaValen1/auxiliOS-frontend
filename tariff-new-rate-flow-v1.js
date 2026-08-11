/* AuxiliOS · Tarifas V3 · Alta guiada de nueva tarifa */
(()=>{'use strict';

const role=()=>String(typeof PERFIL_USUARIO==='undefined'?'':(PERFIL_USUARIO?.roles?.name||PERFIL_USUARIO?.role||'')).toLowerCase();
const canWrite=()=>role()==='administracion';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state=()=>window.TariffMatrixV3?.state||null;
const notify=(m,t='info')=>typeof toast==='function'?toast(m,t):console.log(m);
let loadedBases=[];
let loading=false;

function ensureModal(){
  if(document.getElementById('tmv3-new-rate-scope-modal'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <div class="tmv3-modal" id="tmv3-new-rate-scope-modal">
      <div class="tmv3-dialog">
        <div class="tmv3-dialog-head">
          <div><span class="tmv3-eyebrow">Nueva tarifa</span><h3>¿Dónde aplica esta tarifa?</h3><p>Elegí la prestadora y la base antes de cargar categoría, concepto y valor.</p></div>
          <button class="icon" type="button" data-new-rate-close>×</button>
        </div>
        <div id="tmv3-new-rate-scope-error" class="tmv3-error" hidden></div>
        <div class="tmv3-form-stack">
          <label><span>Prestadora *</span><select id="tmv3-new-rate-company"><option value="">Seleccionar prestadora</option></select></label>
          <label><span>Base *</span><select id="tmv3-new-rate-base" disabled><option value="">Seleccionar base</option></select></label>
          <div id="tmv3-new-rate-scope-help" class="tmv3-info"><b>Base explícita.</b> La tarifa se guarda para una prestadora y una base concretas, preservando las vigencias anteriores.</div>
        </div>
        <div class="tmv3-modal-actions">
          <button type="button" class="secondary" data-new-rate-close>Cancelar</button>
          <button type="button" class="primary" id="tmv3-new-rate-continue">Continuar</button>
        </div>
      </div>
    </div>`);

  document.querySelectorAll('[data-new-rate-close]').forEach(b=>b.addEventListener('click',closeModal));
  document.getElementById('tmv3-new-rate-company')?.addEventListener('change',e=>loadBases(e.target.value));
  document.getElementById('tmv3-new-rate-continue')?.addEventListener('click',continueFlow);
}

function setError(message=''){
  const el=document.getElementById('tmv3-new-rate-scope-error');
  if(!el)return;
  el.textContent=message;
  el.hidden=!message;
}
function openModal(){
  ensureModal();setError('');
  const current=document.getElementById('tmv3-company');
  const company=document.getElementById('tmv3-new-rate-company');
  company.innerHTML=current?.innerHTML||'<option value="">Seleccionar prestadora</option>';
  company.value=state()?.companyId||current?.value||'';
  document.getElementById('tmv3-new-rate-scope-modal')?.classList.add('open');
  if(company.value)loadBases(company.value);else resetBases();
}
function closeModal(){document.getElementById('tmv3-new-rate-scope-modal')?.classList.remove('open')}
function resetBases(){
  loadedBases=[];
  const base=document.getElementById('tmv3-new-rate-base');
  if(base){base.innerHTML='<option value="">Seleccionar base</option>';base.disabled=true;}
}
async function loadBases(companyId){
  resetBases();setError('');
  if(!companyId)return;
  const base=document.getElementById('tmv3-new-rate-base');
  if(base){base.innerHTML='<option value="">Cargando bases…</option>';base.disabled=true;}
  const {data,error}=await _db.rpc('get_company_configuration_v2',{p_company_id:companyId});
  if(error){resetBases();return setError(error.message||'No se pudieron cargar las bases de la prestadora.');}
  loadedBases=(data?.bases||[]).filter(b=>b.is_active!==false);
  if(!base)return;
  if(!loadedBases.length){
    base.innerHTML='<option value="">Sin bases activas</option>';base.disabled=true;
    return setError('Esta prestadora todavía no tiene una base activa vinculada. Configurá sus bases antes de crear el tarifario.');
  }
  base.innerHTML='<option value="">Seleccionar base</option>'+loadedBases.map(b=>`<option value="${esc(b.base_id)}">${esc(b.name||b.base_code||'Base')}</option>`).join('');
  base.disabled=false;
  const currentBase=state()?.companyId===companyId?state()?.baseId:'';
  if(currentBase&&loadedBases.some(b=>String(b.base_id)===String(currentBase)))base.value=currentBase;
  else if(loadedBases.length===1)base.value=String(loadedBases[0].base_id);
}

async function continueFlow(){
  if(loading)return;
  const companyId=document.getElementById('tmv3-new-rate-company')?.value||'';
  const baseId=document.getElementById('tmv3-new-rate-base')?.value||'';
  if(!companyId)return setError('Seleccioná una prestadora.');
  if(!baseId)return setError('Seleccioná una base activa.');
  const api=window.TariffMatrixV3,s=api?.state;
  if(!api||!s)return setError('El módulo de Tarifas todavía no terminó de cargar.');
  loading=true;
  const btn=document.getElementById('tmv3-new-rate-continue');if(btn){btn.disabled=true;btn.textContent='Cargando…';}
  try{
    s.companyId=companyId;s.baseId=baseId;s.bases=[...loadedBases];s.matrix=null;
    const mainCompany=document.getElementById('tmv3-company');
    if(mainCompany)mainCompany.value=companyId;
    const mainBase=document.getElementById('tmv3-base');
    if(mainBase){mainBase.innerHTML='<option value="">Seleccionar base</option>'+loadedBases.map(b=>`<option value="${esc(b.base_id)}">${esc(b.name||b.base_code||'Base')}</option>`).join('');mainBase.disabled=false;mainBase.value=baseId;}
    await api.loadMatrix();
    const enabledCategories=(s.matrix?.categories||[]).filter(x=>x.is_enabled);
    const enabledConcepts=(s.matrix?.concepts||[]).filter(x=>x.is_enabled);
    if(!enabledCategories.length||!enabledConcepts.length){
      setError('La prestadora no tiene categorías o conceptos habilitados. Usá “Configurar prestadora” y activalos antes de cargar valores.');
      return;
    }
    closeModal();
    document.querySelector('[data-tmv3="new-rate"]')?.click();
  }catch(error){setError(error?.message||'No se pudo preparar la nueva tarifa.');}
  finally{loading=false;if(btn){btn.disabled=false;btn.textContent='Continuar';}}
}

function intercept(event){
  const trigger=event.target?.closest?.('[data-tmv3="new-rate"]');
  if(!trigger)return;
  if(!canWrite())return;
  const s=state();
  if(s?.companyId&&s?.baseId&&s?.matrix)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  openModal();
}

document.addEventListener('click',intercept,true);
window.addEventListener('auxilios:profile-ready',ensureModal,{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureModal,{once:true});else ensureModal();
})();
