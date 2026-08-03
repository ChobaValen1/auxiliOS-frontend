/* AuxiliOS · Configuración de facturación por empresa */
(() => {
  'use strict';

  const S = {
    companyId: null,
    config: null,
    selectedBases: new Map(),
    loading: false,
  };

  const role = () => typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : String(PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '').toLowerCase();
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const notify = (message, type = 'info') => typeof toast === 'function'
    ? toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  const open = id => typeof openModal === 'function'
    ? openModal(id)
    : document.getElementById(id)?.classList.add('open');
  const close = id => typeof closeModal === 'function'
    ? closeModal(id)
    : document.getElementById(id)?.classList.remove('open');

  const ROUTES = {
    base_origin_destination_base: 'Base → Origen → Destino → Base',
    base_origin: 'Base → Origen',
    origin_destination: 'Origen → Destino',
    manual: 'Kilometraje manual',
  };
  const TOLLS = {
    route_estimate: 'Estimación de la ruta',
    manual: 'Carga manual / comprobante',
    not_applicable: 'No corresponde',
  };

  function inject() {
    if (document.getElementById('modal-company-billing')) return;

    document.head.insertAdjacentHTML('beforeend', `<style id="company-billing-css">
      .cb-company-section{margin-top:16px;padding:12px;border:1px solid rgba(88,166,255,.22);border-radius:10px;background:rgba(88,166,255,.035)}
      .cb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.cb-head h4{margin:0;font-size:12px}
      .cb-sub{margin-top:3px;font-size:9px;line-height:1.4;color:var(--muted)}
      .cb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:10px}
      .cb-mini{padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--bg)}
      .cb-mini small{display:block;font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.cb-mini div{margin-top:4px;font-size:10px;line-height:1.35}
      .cb-bases{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.cb-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border:1px solid var(--border);border-radius:999px;font-size:8px}
      .cb-pill.warn{border-color:rgba(245,166,35,.35);color:var(--amber)}
      .cb-ready{margin-top:9px;padding:7px 9px;border-radius:7px;font-size:9px}.cb-ready.ok{border:1px solid rgba(39,196,122,.28);background:rgba(39,196,122,.06);color:var(--green)}.cb-ready.warn{border:1px solid rgba(245,166,35,.28);background:rgba(245,166,35,.06);color:var(--amber)}
      .cb-modal{width:min(860px,calc(100vw - 24px));max-width:860px}.cb-modal .modal-body{max-height:min(75vh,720px);overflow:auto}
      .cb-section{margin-bottom:15px}.cb-title{margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--border);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--amber)}
      .cb-base-list{display:grid;gap:7px}.cb-base-row{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)}
      .cb-base-row.disabled{opacity:.5}.cb-base-name{font-size:11px;font-weight:700}.cb-base-address{margin-top:2px;font-size:9px;color:var(--muted)}
      .cb-base-state{font-size:8px;color:var(--green);white-space:nowrap}.cb-base-state.warn{color:var(--amber)}
      .cb-note{margin-top:6px;font-size:9px;line-height:1.4;color:var(--muted)}.cb-check{display:flex;align-items:center;gap:7px;font-size:11px}
      @media(max-width:700px){.cb-grid{grid-template-columns:1fr}.cb-base-row{grid-template-columns:26px minmax(0,1fr)}.cb-base-state{grid-column:2}}
    </style>`);

    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal-company-billing"><div class="modal-box cb-modal"><div class="modal-head"><span class="modal-head-title">Configuración de facturación</span><button class="modal-close" onclick="closeModal('modal-company-billing')">×</button></div><div class="modal-body">
      <div class="cb-section"><div class="cb-title">Regla de la empresa</div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Modo de kilometraje</label><select class="form-input" id="cb-route"><option value="base_origin_destination_base">Base → Origen → Destino → Base</option><option value="base_origin">Base → Origen</option><option value="origin_destination">Origen → Destino</option><option value="manual">Kilometraje manual</option></select></div><div class="form-group"><label class="form-label">Peajes</label><select class="form-input" id="cb-tolls"><option value="route_estimate">Estimación de la ruta</option><option value="manual">Carga manual / comprobante</option><option value="not_applicable">No corresponde</option></select></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Vigente desde</label><input class="form-input" type="date" id="cb-from"></div><div class="form-group"><label class="form-label">Vigente hasta</label><input class="form-input" type="date" id="cb-until"></div></div>
        <label class="cb-check"><input type="checkbox" id="cb-require-verified" checked> Exigir coordenadas verificadas para calcular rutas</label>
        <label class="cb-check" style="margin-top:8px"><input type="checkbox" id="cb-active" checked> Configuración activa</label>
      </div>
      <div class="cb-section"><div class="cb-title">Bases habilitadas</div><div id="cb-base-list" class="cb-base-list"></div><div class="cb-note">Seleccioná todas las bases que aplican a esta prestadora. Todas tienen la misma jerarquía y la base de facturación se elige explícitamente al crear cada servicio.</div></div>
      <div class="form-group"><label class="form-label">Observaciones</label><textarea class="form-input" id="cb-notes" rows="3"></textarea></div>
      <div class="modal-error" id="cb-error" style="display:none"></div>
    </div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-company-billing')">Cancelar</button><button class="btn btn-primary" id="cb-save" onclick="guardarConfiguracionFacturacionEmpresa()">Guardar configuración</button></div></div></div>`);
  }

  async function fetchConfig(companyId) {
    const { data, error } = await _db.rpc('get_company_billing_configuration', {
      p_company_id: companyId,
      p_scheduled_for: new Date().toISOString(),
    });
    if (error) throw error;
    return data || { setting: null, links: [], available_bases: [], ready_for_routing: false };
  }

  function sectionHtml(config) {
    const setting = config.setting;
    const links = (config.links || []).filter(link => link.is_active && link.base_active !== false);
    if (!setting) {
      return `<div class="cb-company-section" id="company-billing-section"><div class="cb-head"><div><h4>Facturación y bases habilitadas</h4><div class="cb-sub">La empresa todavía no tiene definido cómo calcula kilómetros ni qué bases puede utilizar.</div></div>${canWrite() ? '<button class="btn btn-ghost" onclick="abrirConfiguracionFacturacionEmpresa()">Configurar</button>' : ''}</div><div class="cb-ready warn">Configuración pendiente.</div></div>`;
    }
    const basePills = links.length
      ? links.map(link => `<span class="cb-pill ${!link.address_verified ? 'warn' : ''}">${esc(link.name)}${!link.address_verified ? ' · sin verificar' : ''}</span>`).join('')
      : '<span class="cb-pill warn">Sin bases seleccionadas</span>';
    return `<div class="cb-company-section" id="company-billing-section"><div class="cb-head"><div><h4>Facturación y bases habilitadas</h4><div class="cb-sub">Todas las bases vinculadas tienen la misma jerarquía. La base se selecciona en cada alta de servicio.</div></div>${canWrite() ? '<button class="btn btn-ghost" onclick="abrirConfiguracionFacturacionEmpresa()">Editar</button>' : ''}</div><div class="cb-grid"><div class="cb-mini"><small>Kilometraje</small><div>${esc(ROUTES[setting.route_mode] || setting.route_mode)}</div></div><div class="cb-mini"><small>Peajes</small><div>${esc(TOLLS[setting.toll_calculation_mode] || setting.toll_calculation_mode)}</div></div><div class="cb-mini"><small>Bases habilitadas</small><div>${links.length}</div></div></div><div class="cb-bases">${basePills}</div><div class="cb-ready ${config.ready_for_routing ? 'ok' : 'warn'}">${config.ready_for_routing ? '✓ Lista para calcular recorridos.' : '⚠ Falta al menos una base activa con coordenadas verificadas.'}</div></div>`;
  }

  async function renderForCompany(companyId) {
    if (!canRead() || !companyId || S.loading) return;
    S.companyId = companyId;
    S.loading = true;
    try {
      const config = await fetchConfig(companyId);
      if (S.companyId !== companyId) return;
      S.config = config;
      const detail = document.querySelector('#emp-detail .emp-detail');
      if (!detail) return;
      detail.querySelector('#company-billing-section')?.remove();
      detail.insertAdjacentHTML('beforeend', sectionHtml(config));
    } catch (error) {
      console.error('[facturación empresa] carga:', error);
      const detail = document.querySelector('#emp-detail .emp-detail');
      if (detail) {
        detail.querySelector('#company-billing-section')?.remove();
        detail.insertAdjacentHTML('beforeend', '<div class="cb-company-section" id="company-billing-section"><div class="cb-ready warn">No se pudo cargar la configuración de facturación.</div></div>');
      }
    } finally {
      S.loading = false;
    }
  }

  function resetSelectedBases(config) {
    S.selectedBases = new Map();
    (config.links || []).forEach(link => {
      S.selectedBases.set(link.base_id, {
        base_id: link.base_id,
        selected: Boolean(link.is_active),
      });
    });
  }

  function renderBaseSelector() {
    const list = document.getElementById('cb-base-list');
    if (!list) return;
    const bases = S.config?.available_bases || [];
    if (!bases.length) {
      list.innerHTML = '<div class="cb-ready warn">No existen bases geográficas. Creá una desde el módulo Bases geográficas.</div>';
      return;
    }
    list.innerHTML = bases.map(base => {
      const state = S.selectedBases.get(base.base_id) || { selected: false };
      const disabled = !base.is_active;
      const verified = Boolean(base.address_verified);
      return `<label class="cb-base-row ${disabled ? 'disabled' : ''}" data-base-id="${esc(base.base_id)}"><input type="checkbox" ${state.selected ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="cambiarBaseEmpresa('${esc(base.base_id)}',this.checked)"><span><span class="cb-base-name">${esc(base.name)}</span><span class="cb-base-address">${esc(base.address)}${base.city ? ` · ${esc(base.city)}` : ''}</span></span><span class="cb-base-state ${verified ? '' : 'warn'}">${verified ? '✓ Coordenadas verificadas' : '⚠ Sin verificar'}</span></label>`;
    }).join('');
  }

  async function openEditor() {
    if (!canWrite() || !S.companyId) return notify('Solo Administración puede modificar esta configuración', 'error');
    try {
      S.config = await fetchConfig(S.companyId);
      resetSelectedBases(S.config);
      const setting = S.config.setting || {};
      document.getElementById('cb-route').value = setting.route_mode || 'base_origin_destination_base';
      document.getElementById('cb-tolls').value = setting.toll_calculation_mode || 'route_estimate';
      document.getElementById('cb-from').value = setting.valid_from || new Date().toLocaleDateString('sv-SE');
      document.getElementById('cb-until').value = setting.valid_until || '';
      document.getElementById('cb-require-verified').checked = setting.requires_verified_base !== false;
      document.getElementById('cb-active').checked = setting.is_active !== false;
      document.getElementById('cb-notes').value = setting.notes || '';
      setError('');
      renderBaseSelector();
      open('modal-company-billing');
    } catch (error) {
      notify(error.message || 'No se pudo abrir la configuración', 'error');
    }
  }

  function changeBase(baseId, selected) {
    S.selectedBases.set(baseId, { base_id: baseId, selected: Boolean(selected) });
    renderBaseSelector();
  }

  function setError(message) {
    const element = document.getElementById('cb-error');
    if (!element) return;
    element.textContent = message || '';
    element.style.display = message ? 'block' : 'none';
  }

  async function save() {
    if (!canWrite() || !S.companyId) return;
    const bases = [...S.selectedBases.values()]
      .filter(item => item.selected)
      .map(item => ({ base_id: item.base_id, is_active: true }));
    const active = Boolean(document.getElementById('cb-active')?.checked);
    if (active && !bases.length) return setError('Seleccioná al menos una base para una configuración activa.');

    const payload = {
      billing_setting_id: S.config?.setting?.billing_setting_id || null,
      company_id: S.companyId,
      contract_id: null,
      route_mode: document.getElementById('cb-route')?.value,
      toll_calculation_mode: document.getElementById('cb-tolls')?.value,
      valid_from: document.getElementById('cb-from')?.value,
      valid_until: document.getElementById('cb-until')?.value || null,
      requires_verified_base: Boolean(document.getElementById('cb-require-verified')?.checked),
      is_active: active,
      notes: String(document.getElementById('cb-notes')?.value || '').trim() || null,
      bases,
    };

    const button = document.getElementById('cb-save');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    setError('');
    try {
      const { data, error } = await _db.rpc('save_company_billing_configuration', { p_payload: payload });
      if (error) throw error;
      S.config = data;
      close('modal-company-billing');
      notify('Configuración de facturación guardada', 'success');
      await renderForCompany(S.companyId);
    } catch (error) {
      console.error('[facturación empresa] guardar:', error);
      setError(error.message || 'No se pudo guardar la configuración.');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Guardar configuración'; }
    }
  }

  function installCompanySelectionHook() {
    if (typeof window.seleccionarEmpresa !== 'function' || window.seleccionarEmpresa.__billingWrapped) return false;
    const original = window.seleccionarEmpresa;
    const wrapped = async function(companyId, ...args) {
      const result = await original(companyId, ...args);
      await renderForCompany(companyId);
      return result;
    };
    wrapped.__billingWrapped = true;
    window.seleccionarEmpresa = wrapped;
    return true;
  }

  function init() {
    inject();
    let attempts = 0;
    const timer = setInterval(() => {
      if (installCompanySelectionHook() || ++attempts > 50) clearInterval(timer);
    }, 200);
  }

  Object.assign(window, {
    abrirConfiguracionFacturacionEmpresa: openEditor,
    guardarConfiguracionFacturacionEmpresa: save,
    cambiarBaseEmpresa: changeBase,
    cargarConfiguracionFacturacionEmpresa: renderForCompany,
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
