/* AuxiliOS · Configuración de servicios, tipos de tarifa y matriz histórica */
(() => {
  'use strict';

  const S = {
    services: [], tariffTypes: [], companies: [], companyConfig: null, matrix: [],
    companyId: null, baseId: null, asOf: new Date().toISOString().slice(0, 10),
    serviceEdit: null, tariffEdit: null, priceEdit: null, loading: false,
  };

  const role = () => String(typeof PERFIL_USUARIO === 'undefined' ? '' : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canRead = () => ['administracion', 'facturacion', 'supervision'].includes(role());
  const canWrite = () => role() === 'administracion';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = value => Number(String(value ?? '').replace(',', '.')) || 0;
  const money = (value, currency = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(num(value));
  const dateFmt = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-AR') : '—';
  const notify = (message, type = 'info') => typeof toast === 'function' ? toast(message, type) : console[type === 'error' ? 'error' : 'log'](message);
  const open = id => typeof openModal === 'function' ? openModal(id) : document.getElementById(id)?.classList.add('open');
  const close = id => typeof closeModal === 'function' ? closeModal(id) : document.getElementById(id)?.classList.remove('open');
  const input = id => document.getElementById(id)?.value ?? '';
  const checked = id => Boolean(document.getElementById(id)?.checked);
  const currentCompany = () => S.companies.find(x => x.company_id === S.companyId);
  const currentBase = () => S.companyConfig?.bases?.find(x => x.base_id === S.baseId);
  const categoryLabel = value => ({ primary: 'Primario', secondary: 'Secundario', mixed: 'Mixto', system: 'Sistema' }[value] || value);
  const categoryClass = value => ['primary', 'secondary', 'mixed'].includes(value) ? value : 'muted';
  const unitLabel = value => ({ service: 'Por servicio', hour: 'Por hora', unit: 'Por unidad', day: 'Por día', fixed: 'Monto fijo', km: 'Por km' }[value] || value);
  const modeLabel = value => ({ numeric: 'Valor', automatic: 'Auto', not_applicable: 'No aplica' }[value] || value);
  const modeValue = (mode, value, currency = 'ARS') => mode === 'automatic'
    ? '<span class="cr-price auto">Auto</span>'
    : mode === 'not_applicable' || value == null
      ? '<span class="cr-price na">—</span>'
      : `<span class="cr-price numeric">${money(value, currency)}</span>`;

  function inject() {
    if (document.getElementById('screen-config-service-types')) return;
    const css = document.createElement('link');
    css.id = 'configuration-reference-css'; css.rel = 'stylesheet'; css.href = '/configuration-reference.css';
    document.head.appendChild(css);

    const bottom = document.querySelector('.sidenav .nav-bottom');
    bottom?.insertAdjacentHTML('beforebegin', `
      <div class="nav-item" id="nav-config-service-types" onclick="goTo('config-service-types')" style="display:none"><span class="nav-icon">🛠️</span><span class="nav-label">Tipos de servicio</span></div>
      <div class="nav-item" id="nav-config-tariff-types" onclick="goTo('config-tariff-types')" style="display:none"><span class="nav-icon">💰</span><span class="nav-label">Tipos de tarifa</span></div>
      <div class="nav-item" id="nav-config-tariff-matrix" onclick="goTo('config-tariff-matrix')" style="display:none"><span class="nav-icon">📊</span><span class="nav-label">Tarifas</span></div>`);

    document.querySelector('.content')?.insertAdjacentHTML('beforeend', `
      <div class="screen" id="screen-config-service-types">${serviceScreen()}</div>
      <div class="screen" id="screen-config-tariff-types">${tariffTypeScreen()}</div>
      <div class="screen" id="screen-config-tariff-matrix">${matrixScreen()}</div>`);

    document.body.insertAdjacentHTML('beforeend', `${serviceModal()}${tariffTypeModal()}${providerServicesModal()}${priceModal()}${historyModal()}`);
  }

  const serviceScreen = () => `
    <div class="cr-head"><div><h2>Tipos de servicio</h2><div class="cr-sub">Catálogo global de trabajos y productos. La categoría define si puede iniciar un servicio, agregarse como adicional o cumplir ambos roles.</div></div><button class="btn btn-primary cr-write" onclick="abrirTipoServicioConfig()">＋ Agregar tipo</button></div>
    <div class="cr-notice"><b>Tipo de servicio = qué se realizó.</b> La forma de cálculo se define por separado en Tipos de tarifa.</div>
    <div class="cr-readonly" id="cr-service-readonly" style="display:none">Acceso de consulta. Solo Administración puede modificar el catálogo.</div>
    <div class="cr-kpis" id="cr-service-kpis"></div>
    <div class="cr-toolbar"><input class="form-input" id="cr-service-q" placeholder="Buscar por descripción, código o categoría" oninput="renderTiposServicioConfig()"><select class="form-input" id="cr-service-filter" onchange="renderTiposServicioConfig()"><option value="all">Todas las categorías</option><option value="primary">Primarios</option><option value="secondary">Secundarios</option><option value="mixed">Mixtos</option><option value="inactive">No habilitados</option></select><button class="btn btn-ghost" onclick="cargarConfiguracionReferencia()">↻</button></div>
    <div class="cr-panel"><div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Descripción</th><th>Código</th><th>Categoría</th><th>Tipo de tarifa</th><th>Unidad</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="cr-service-body"></tbody></table></div></div>`;

  const tariffTypeScreen = () => `
    <div class="cr-head"><div><h2>Tipos de tarifa</h2><div class="cr-sub">Agrupa servicios según su forma de facturación. Una tarifa puede sumar kilómetros o cobrar solamente un importe fijo o por cantidad.</div></div><button class="btn btn-primary cr-write" onclick="abrirTipoTarifaConfig()">＋ Agregar tipo</button></div>
    <div class="cr-formula"><b>Movida:</b> importe del servicio + KM. <b>Trabajo y Venta:</b> importe por unidad, hora, día o servicio; no suman KM.</div>
    <div class="cr-grid" id="cr-tariff-type-grid"><div class="cr-empty">Cargando…</div></div>`;

  const matrixScreen = () => `
    <div class="cr-head"><div><h2>Tarifas e historial</h2><div class="cr-sub">Precios versionados por prestadora, base, servicio y fecha de vigencia. Cada modificación crea una nueva versión y conserva las anteriores.</div></div><button class="btn btn-ghost cr-write" onclick="abrirServiciosPrestadoraConfig()">⚙ Servicios de la prestadora</button></div>
    <div class="cr-notice"><b>No se sobrescriben precios históricos.</b> Día, noche, fin de semana, asfalto, ripio y valores automáticos se almacenan como reglas independientes.</div>
    <div class="cr-toolbar"><select class="form-input" id="cr-matrix-company" onchange="cambiarEmpresaTarifasConfig(this.value)"><option value="">Seleccionar prestadora</option></select><select class="form-input" id="cr-matrix-base" onchange="cambiarBaseTarifasConfig(this.value)"><option value="">Seleccionar base</option></select><input class="form-input" id="cr-matrix-date" type="date" value="${S.asOf}" onchange="cambiarFechaTarifasConfig(this.value)"><input class="form-input" id="cr-matrix-q" placeholder="Buscar servicio" oninput="renderMatrizTarifasConfig()"><button class="btn btn-ghost" onclick="cargarMatrizTarifasConfig()">↻</button></div>
    <div class="cr-panel"><div class="cr-table-wrap"><table class="cr-table cr-matrix"><thead><tr><th>Vigencia</th><th>Base</th><th>Prestadora</th><th class="cr-service-col">Servicio</th><th>Servicio día</th><th>Servicio noche</th><th>Finde/Feriado</th><th>Asfalto día</th><th>Asfalto noche</th><th>Asfalto finde</th><th>Ripio día</th><th>Ripio noche</th><th>Ripio finde</th><th>Guarda</th><th>Código</th><th>Acciones</th></tr></thead><tbody id="cr-matrix-body"></tbody></table></div></div>`;

  function serviceModal() {
    return `<div class="modal-backdrop" id="modal-config-service-type"><div class="modal-box cr-modal"><div class="modal-head"><span class="modal-head-title" id="cr-service-modal-title">Tipo de servicio</span><button class="modal-close" onclick="closeModal('modal-config-service-type')">×</button></div><div class="modal-body">
      <div class="cr-form-section"><div class="cr-form-title">Identificación</div><div class="cr-form-grid"><div class="form-group"><label class="form-label">Descripción *</label><input class="form-input" id="crs-name"></div><div class="form-group"><label class="form-label">Código interno *</label><input class="form-input" id="crs-code"></div><div class="form-group"><label class="form-label">Ícono</label><input class="form-input" id="crs-icon" maxlength="4"></div></div><div class="form-group"><label class="form-label">Descripción operativa</label><input class="form-input" id="crs-description"></div></div>
      <div class="cr-form-section"><div class="cr-form-title">Clasificación</div><div class="cr-form-grid"><div class="form-group"><label class="form-label">Categoría</label><select class="form-input" id="crs-category"><option value="primary">Primario</option><option value="secondary">Secundario</option><option value="mixed">Mixto</option></select></div><div class="form-group"><label class="form-label">Tipo de tarifa</label><select class="form-input" id="crs-tariff-type"></select></div><div class="form-group"><label class="form-label">Unidad predeterminada</label><select class="form-input" id="crs-unit"><option value="service">Por servicio</option><option value="hour">Por hora</option><option value="unit">Por unidad</option><option value="day">Por día</option><option value="fixed">Monto fijo</option></select></div></div><label class="cr-check" style="max-width:260px"><input type="checkbox" id="crs-active" checked><span>Tipo habilitado</span></label></div>
      <div class="modal-error" id="crs-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-config-service-type')">Cancelar</button><button class="btn btn-primary" onclick="guardarTipoServicioConfig()">Guardar</button></div></div></div>`;
  }

  function tariffTypeModal() {
    return `<div class="modal-backdrop" id="modal-config-tariff-type"><div class="modal-box cr-modal"><div class="modal-head"><span class="modal-head-title" id="crt-modal-title">Tipo de tarifa</span><button class="modal-close" onclick="closeModal('modal-config-tariff-type')">×</button></div><div class="modal-body"><div class="cr-form-grid"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="crt-name"></div><div class="form-group"><label class="form-label">Código *</label><input class="form-input" id="crt-code"></div><div class="form-group"><label class="form-label">Orden</label><input class="form-input" type="number" id="crt-order"></div></div><div class="form-group"><label class="form-label">Descripción</label><input class="form-input" id="crt-description"></div><div class="cr-inline"><label class="cr-check"><input type="checkbox" id="crt-adds-km"><span>Suma kilómetros</span></label><label class="cr-check"><input type="checkbox" id="crt-active" checked><span>Activo</span></label></div><div class="cr-form-title" style="margin-top:16px">Servicios asociados</div><div class="cr-check-grid" id="crt-services"></div><div class="modal-error" id="crt-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-config-tariff-type')">Cancelar</button><button class="btn btn-primary" onclick="guardarTipoTarifaConfig()">Guardar</button></div></div></div>`;
  }

  function providerServicesModal() {
    return `<div class="modal-backdrop" id="modal-config-provider-services"><div class="modal-box cr-modal"><div class="modal-head"><span class="modal-head-title">Servicios habilitados por prestadora</span><button class="modal-close" onclick="closeModal('modal-config-provider-services')">×</button></div><div class="modal-body"><div class="cr-notice">La habilitación de un servicio es independiente de su precio. El código puede ser fijo, generado, manual o automático.</div><div class="cr-provider-services" id="cr-provider-services"></div><div class="modal-error" id="cr-provider-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-config-provider-services')">Cancelar</button><button class="btn btn-primary" onclick="guardarServiciosPrestadoraConfig()">Guardar configuración</button></div></div></div>`;
  }

  const valueField = (prefix, label) => `<div class="form-group"><label class="form-label">${label}</label><div class="cr-value-field"><select class="form-input" id="${prefix}-mode" onchange="actualizarModoValorTarifaConfig('${prefix}')"><option value="numeric">Valor</option><option value="automatic">Auto</option><option value="not_applicable">No aplica</option></select><input class="form-input" id="${prefix}-value" type="number" min="0" step="0.01"></div></div>`;

  function priceModal() {
    return `<div class="modal-backdrop" id="modal-config-price"><div class="modal-box cr-modal"><div class="modal-head"><span class="modal-head-title" id="crp-title">Nueva vigencia</span><button class="modal-close" onclick="closeModal('modal-config-price')">×</button></div><div class="modal-body"><div class="cr-formula" id="crp-context"></div><div class="cr-form-section"><div class="cr-form-title">Vigencia y código</div><div class="cr-form-grid"><div class="form-group"><label class="form-label">Vigencia desde *</label><input class="form-input" type="date" id="crp-from"></div><div class="form-group"><label class="form-label">Vigencia hasta</label><input class="form-input" type="date" id="crp-until"></div><div class="form-group"><label class="form-label">Código de facturación</label><input class="form-input" id="crp-code"></div></div></div><div class="cr-form-section"><div class="cr-form-title">Importe del servicio / movida</div><div class="cr-form-grid">${valueField('crp-service-day','Día')}${valueField('crp-service-night','Noche')}${valueField('crp-service-weekend','Fin de semana / feriado')}</div></div><div class="cr-form-section" id="crp-km-section"><div class="cr-form-title">Valor por kilómetro</div><div class="cr-form-grid">${valueField('crp-asphalt-day','Asfalto día')}${valueField('crp-asphalt-night','Asfalto noche')}${valueField('crp-asphalt-weekend','Asfalto finde')}${valueField('crp-dirt-day','Ripio día')}${valueField('crp-dirt-night','Ripio noche')}${valueField('crp-dirt-weekend','Ripio finde')}</div></div><div class="cr-form-section"><div class="cr-form-title">Otros valores</div><div class="cr-form-grid">${valueField('crp-storage','Guarda de vehículo')}<div class="form-group" style="grid-column:span 2"><label class="form-label">Motivo del cambio</label><input class="form-input" id="crp-reason" placeholder="Ej: actualización convenio junio"></div></div></div><div class="modal-error" id="crp-error" style="display:none"></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-config-price')">Cancelar</button><button class="btn btn-primary" onclick="guardarVersionPrecioConfig()">Crear nueva versión</button></div></div></div>`;
  }

  function historyModal() {
    return `<div class="modal-backdrop" id="modal-config-price-history"><div class="modal-box cr-modal"><div class="modal-head"><span class="modal-head-title" id="crh-title">Historial de tarifas</span><button class="modal-close" onclick="closeModal('modal-config-price-history')">×</button></div><div class="modal-body" id="crh-body"><div class="cr-empty">Cargando…</div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-config-price-history')">Cerrar</button></div></div></div>`;
  }

  function applyRole() {
    ['nav-config-service-types', 'nav-config-tariff-types', 'nav-config-tariff-matrix'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = canRead() ? '' : 'none'; });
    document.querySelectorAll('.cr-write').forEach(el => { el.style.display = canWrite() ? '' : 'none'; });
    const ro = document.getElementById('cr-service-readonly'); if (ro) ro.style.display = canRead() && !canWrite() ? '' : 'none';
  }

  async function loadAll() {
    if (!canRead() || S.loading) return;
    S.loading = true;
    try {
      const [services, types, companies] = await Promise.all([
        _db.rpc('list_service_types_config', { p_include_inactive: true }),
        _db.rpc('list_tariff_types_config'),
        _db.from('companies').select('company_id,legal_name,trade_name,status').eq('status', 'active').order('legal_name'),
      ]);
      if (services.error) throw services.error;
      if (types.error) throw types.error;
      if (companies.error) throw companies.error;
      S.services = Array.isArray(services.data) ? services.data : [];
      S.tariffTypes = Array.isArray(types.data) ? types.data : [];
      S.companies = companies.data || [];
      if (!S.companyId && S.companies.length) S.companyId = S.companies[0].company_id;
      renderServices(); renderTariffTypes(); fillCompanySelect();
      if (S.companyId) await changeCompany(S.companyId);
    } catch (error) {
      notify(error.message || 'No se pudo cargar la configuración', 'error');
    } finally { S.loading = false; }
  }

  function renderServices() {
    const q = String(input('cr-service-q')).toLowerCase().trim();
    const filter = input('cr-service-filter') || 'all';
    const rows = S.services.filter(s => (filter === 'all' || (filter === 'inactive' ? !s.is_active : s.category === filter)) && (!q || `${s.name} ${s.code} ${s.description || ''} ${s.category}`.toLowerCase().includes(q)));
    const counts = { total: S.services.length, primary: S.services.filter(x => x.category === 'primary').length, secondary: S.services.filter(x => x.category === 'secondary').length, mixed: S.services.filter(x => x.category === 'mixed').length };
    const kpis = document.getElementById('cr-service-kpis');
    if (kpis) kpis.innerHTML = `<div class="cr-kpi"><small>Total</small><b>${counts.total}</b></div><div class="cr-kpi"><small>Primarios</small><b>${counts.primary}</b></div><div class="cr-kpi"><small>Secundarios</small><b>${counts.secondary}</b></div><div class="cr-kpi"><small>Mixtos</small><b>${counts.mixed}</b></div>`;
    const body = document.getElementById('cr-service-body'); if (!body) return;
    body.innerHTML = rows.length ? rows.map(s => `<tr><td><strong>${esc(s.name)}</strong><small>${esc(s.description || '')}</small></td><td>${esc(s.code)}</td><td><span class="cr-pill ${categoryClass(s.category)}">${categoryLabel(s.category)}</span></td><td>${(s.tariff_types || []).map(t => `<span class="cr-pill info">${esc(t.name)}</span>`).join(' ') || '<span class="cr-pill muted">Sin asociar</span>'}</td><td>${unitLabel(s.pricing_unit)}</td><td><span class="cr-pill ${s.is_active ? 'ok' : 'bad'}">${s.is_active ? 'Habilitado' : 'No habilitado'}</span></td><td>${canWrite() ? `<button class="cr-icon-btn" onclick="abrirTipoServicioConfig('${s.concept_id}')">✎</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="7"><div class="cr-empty">No hay resultados.</div></td></tr>';
  }

  function renderTariffTypes() {
    const grid = document.getElementById('cr-tariff-type-grid'); if (!grid) return;
    grid.innerHTML = S.tariffTypes.length ? S.tariffTypes.map(t => `<article class="cr-card"><div class="cr-card-head"><div><h3>${esc(t.name)}</h3><span class="cr-pill ${t.is_active ? 'ok' : 'bad'}">${t.is_active ? 'Activo' : 'Inactivo'}</span></div>${canWrite() ? `<button class="cr-icon-btn" onclick="abrirTipoTarifaConfig('${t.tariff_type_id}')">✎</button>` : ''}</div><p>${esc(t.description || '')}</p><div class="cr-services">${(t.services || []).map(s => `<span class="cr-service-chip">${esc(s.name)}</span>`).join('') || '<span class="cr-pill muted">Sin servicios</span>'}</div><div class="cr-rule"><span>Suma KM</span><b>${t.adds_km ? '✓ Sí' : '✕ No'}</b></div></article>`).join('') : '<div class="cr-empty">No hay tipos de tarifa.</div>';
  }

  function openService(id = null) {
    if (!canWrite()) return;
    const row = S.services.find(x => x.concept_id === id);
    S.serviceEdit = row || null;
    document.getElementById('cr-service-modal-title').textContent = row ? 'Editar tipo de servicio' : 'Nuevo tipo de servicio';
    document.getElementById('crs-name').value = row?.name || '';
    document.getElementById('crs-code').value = row?.code || '';
    document.getElementById('crs-code').disabled = Boolean(row);
    document.getElementById('crs-icon').value = row?.icon || '⚙';
    document.getElementById('crs-description').value = row?.description || '';
    document.getElementById('crs-category').value = row?.category || 'secondary';
    document.getElementById('crs-unit').value = row?.pricing_unit || 'service';
    document.getElementById('crs-active').checked = row?.is_active !== false;
    const type = row?.tariff_types?.[0]?.tariff_type_id || S.tariffTypes.find(x => x.code === 'work')?.tariff_type_id || '';
    document.getElementById('crs-tariff-type').innerHTML = S.tariffTypes.filter(x => x.is_active).map(x => `<option value="${x.tariff_type_id}" ${x.tariff_type_id === type ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    hideError('crs-error'); open('modal-config-service-type');
  }

  async function saveService() {
    const name = input('crs-name').trim(), code = input('crs-code').trim().toLowerCase();
    if (!name || !code) return showError('crs-error', 'Completá descripción y código.');
    const selectedType = input('crs-tariff-type');
    const selected = S.tariffTypes.find(x => x.tariff_type_id === selectedType);
    const family = selected?.code === 'movement' ? 'primary' : selected?.code === 'sale' ? 'sale' : 'variable';
    const payload = { concept_id: S.serviceEdit?.concept_id || null, name, code, description: input('crs-description'), icon: input('crs-icon') || '⚙', category: input('crs-category'), pricing_unit: input('crs-unit'), is_active: checked('crs-active'), billing_family: family, distance_chargeable: Boolean(selected?.adds_km), vehicle_class: S.serviceEdit?.vehicle_class || null, sort_order: S.serviceEdit?.sort_order || 300 };
    const result = await _db.rpc('save_service_type_config', { p_payload: payload });
    if (result.error) return showError('crs-error', result.error.message);
    const id = result.data.concept_id;
    for (const t of S.tariffTypes) {
      const ids = new Set((t.services || []).map(x => x.concept_id));
      if (t.tariff_type_id === selectedType) ids.add(id); else ids.delete(id);
      const update = await _db.rpc('save_tariff_type_config', { p_payload: { tariff_type_id: t.tariff_type_id, name: t.name, description: t.description, adds_km: t.adds_km, is_active: t.is_active, sort_order: t.sort_order, service_ids: [...ids] } });
      if (update.error) return showError('crs-error', update.error.message);
    }
    close('modal-config-service-type'); notify('Tipo de servicio guardado', 'success'); await loadAll();
  }

  function openTariffType(id = null) {
    if (!canWrite()) return;
    const row = S.tariffTypes.find(x => x.tariff_type_id === id);
    S.tariffEdit = row || null;
    document.getElementById('crt-modal-title').textContent = row ? 'Editar tipo de tarifa' : 'Nuevo tipo de tarifa';
    document.getElementById('crt-name').value = row?.name || '';
    document.getElementById('crt-code').value = row?.code || '';
    document.getElementById('crt-code').disabled = Boolean(row);
    document.getElementById('crt-description').value = row?.description || '';
    document.getElementById('crt-order').value = row?.sort_order || 100;
    document.getElementById('crt-adds-km').checked = Boolean(row?.adds_km);
    document.getElementById('crt-active').checked = row?.is_active !== false;
    const selected = new Set((row?.services || []).map(x => x.concept_id));
    document.getElementById('crt-services').innerHTML = S.services.filter(x => x.is_active).map(s => `<label class="cr-check"><input type="checkbox" class="crt-service-check" value="${s.concept_id}" ${selected.has(s.concept_id) ? 'checked' : ''}><span>${esc(s.name)} · ${categoryLabel(s.category)}</span></label>`).join('');
    hideError('crt-error'); open('modal-config-tariff-type');
  }

  async function saveTariffType() {
    const name = input('crt-name').trim(), code = input('crt-code').trim().toLowerCase();
    if (!name || !code) return showError('crt-error', 'Completá nombre y código.');
    const serviceIds = [...document.querySelectorAll('.crt-service-check:checked')].map(x => x.value);
    const result = await _db.rpc('save_tariff_type_config', { p_payload: { tariff_type_id: S.tariffEdit?.tariff_type_id || null, name, code, description: input('crt-description'), adds_km: checked('crt-adds-km'), is_active: checked('crt-active'), sort_order: Number(input('crt-order') || 100), service_ids: serviceIds } });
    if (result.error) return showError('crt-error', result.error.message);
    close('modal-config-tariff-type'); notify('Tipo de tarifa guardado', 'success'); await loadAll();
  }

  function fillCompanySelect() {
    const select = document.getElementById('cr-matrix-company'); if (!select) return;
    select.innerHTML = '<option value="">Seleccionar prestadora</option>' + S.companies.map(c => `<option value="${c.company_id}" ${c.company_id === S.companyId ? 'selected' : ''}>${esc(c.trade_name || c.legal_name)}</option>`).join('');
  }

  async function changeCompany(id) {
    S.companyId = id || null; S.baseId = null; S.companyConfig = null; S.matrix = [];
    if (!S.companyId) return renderMatrix();
    const result = await _db.rpc('get_company_configuration_v2', { p_company_id: S.companyId });
    if (result.error) return notify(result.error.message, 'error');
    S.companyConfig = result.data || { services: [], bases: [] };
    S.baseId = S.companyConfig.bases?.find(x => x.is_primary)?.base_id || S.companyConfig.bases?.[0]?.base_id || null;
    const select = document.getElementById('cr-matrix-base');
    if (select) select.innerHTML = '<option value="">Tarifa general, sin base</option>' + (S.companyConfig.bases || []).map(b => `<option value="${b.base_id}" ${b.base_id === S.baseId ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
    await loadMatrix();
  }

  async function loadMatrix() {
    if (!S.companyId) return renderMatrix();
    const result = await _db.rpc('list_company_tariff_matrix_v2', { p_company_id: S.companyId, p_base_id: S.baseId || null, p_as_of: S.asOf });
    if (result.error) return notify(result.error.message, 'error');
    S.matrix = Array.isArray(result.data) ? result.data : []; renderMatrix();
  }

  function renderMatrix() {
    const body = document.getElementById('cr-matrix-body'); if (!body) return;
    const q = String(input('cr-matrix-q')).toLowerCase().trim();
    const rows = S.matrix.filter(x => !q || x.service_name.toLowerCase().includes(q));
    if (!S.companyId) { body.innerHTML = '<tr><td colspan="16"><div class="cr-empty">Seleccioná una prestadora.</div></td></tr>'; return; }
    const companyName = currentCompany()?.trade_name || currentCompany()?.legal_name || '—';
    const baseName = currentBase()?.name || 'General';
    body.innerHTML = rows.length ? rows.map(r => `<tr class="${r.is_enabled ? '' : 'disabled'}"><td>${dateFmt(r.valid_from)}</td><td>${esc(baseName)}</td><td>${esc(companyName)}</td><td class="cr-service-col"><strong>${esc(r.service_name)}</strong><small>${categoryLabel(r.service_category)}${r.is_enabled ? '' : ' · No habilitado'}</small></td><td>${modeValue(r.service_day_mode,r.service_day_value,r.currency)}</td><td>${modeValue(r.service_night_mode,r.service_night_value,r.currency)}</td><td>${modeValue(r.service_weekend_mode,r.service_weekend_value,r.currency)}</td><td>${modeValue(r.asphalt_day_mode,r.asphalt_day_value,r.currency)}</td><td>${modeValue(r.asphalt_night_mode,r.asphalt_night_value,r.currency)}</td><td>${modeValue(r.asphalt_weekend_mode,r.asphalt_weekend_value,r.currency)}</td><td>${modeValue(r.dirt_day_mode,r.dirt_day_value,r.currency)}</td><td>${modeValue(r.dirt_night_mode,r.dirt_night_value,r.currency)}</td><td>${modeValue(r.dirt_weekend_mode,r.dirt_weekend_value,r.currency)}</td><td>${modeValue(r.storage_mode,r.storage_value,r.currency)}</td><td>${esc(r.service_code || '—')}</td><td><div class="cr-matrix-actions">${canWrite() && r.is_enabled ? `<button class="cr-icon-btn" onclick="abrirVersionPrecioConfig('${r.concept_id}')">✎</button>` : ''}<button class="cr-icon-btn" onclick="abrirHistorialPrecioConfig('${r.concept_id}')">◷</button></div></td></tr>`).join('') : '<tr><td colspan="16"><div class="cr-empty">No hay tarifas para la selección.</div></td></tr>';
  }

  function openProviderServices() {
    if (!canWrite() || !S.companyId || !S.companyConfig) return notify('Seleccioná una prestadora', 'error');
    document.getElementById('cr-provider-services').innerHTML = (S.companyConfig.services || []).map(s => `<div class="cr-provider-row"><input type="checkbox" class="cr-provider-enabled" data-id="${s.concept_id}" ${s.is_enabled ? 'checked' : ''}><div><b>${esc(s.name)}</b><small>${categoryLabel(s.category)}</small></div><input class="form-input cr-provider-code" data-id="${s.concept_id}" value="${esc(s.external_code || '')}" placeholder="Código"><select class="form-input cr-provider-mode" data-id="${s.concept_id}"><option value="fixed" ${s.code_mode === 'fixed' ? 'selected' : ''}>Fijo</option><option value="generated" ${s.code_mode === 'generated' ? 'selected' : ''}>Generado</option><option value="manual" ${s.code_mode === 'manual' ? 'selected' : ''}>Manual</option><option value="automatic" ${s.code_mode === 'automatic' ? 'selected' : ''}>Auto</option></select></div>`).join('');
    hideError('cr-provider-error'); open('modal-config-provider-services');
  }

  async function saveProviderServices() {
    const rows = S.companyConfig.services || [];
    for (const s of rows) {
      const enabled = document.querySelector(`.cr-provider-enabled[data-id="${s.concept_id}"]`)?.checked || false;
      const externalCode = document.querySelector(`.cr-provider-code[data-id="${s.concept_id}"]`)?.value || '';
      const codeMode = document.querySelector(`.cr-provider-mode[data-id="${s.concept_id}"]`)?.value || 'fixed';
      const result = await _db.rpc('save_company_service_setting_v2', { p_payload: { company_id: S.companyId, concept_id: s.concept_id, is_enabled: enabled, external_code: externalCode, code_mode: codeMode } });
      if (result.error) return showError('cr-provider-error', result.error.message);
    }
    close('modal-config-provider-services'); notify('Servicios de la prestadora actualizados', 'success'); await changeCompany(S.companyId);
  }

  function setValueField(prefix, mode, value) {
    const modeEl = document.getElementById(`${prefix}-mode`), valueEl = document.getElementById(`${prefix}-value`);
    if (modeEl) modeEl.value = mode || 'not_applicable';
    if (valueEl) valueEl.value = value ?? '';
    updateMode(prefix);
  }

  function updateMode(prefix) {
    const mode = input(`${prefix}-mode`), valueEl = document.getElementById(`${prefix}-value`);
    if (valueEl) { valueEl.disabled = mode !== 'numeric'; if (mode !== 'numeric') valueEl.value = ''; }
  }

  function openPrice(conceptId) {
    if (!canWrite() || !S.companyId) return;
    const row = S.matrix.find(x => x.concept_id === conceptId);
    if (!row) return;
    S.priceEdit = row;
    document.getElementById('crp-title').textContent = `Nueva vigencia · ${row.service_name}`;
    document.getElementById('crp-context').innerHTML = `<b>${esc(currentCompany()?.trade_name || currentCompany()?.legal_name || '')}</b> · ${esc(currentBase()?.name || 'Tarifa general')} · ${categoryLabel(row.service_category)}`;
    document.getElementById('crp-from').value = new Date().toISOString().slice(0,10);
    document.getElementById('crp-until').value = '';
    document.getElementById('crp-code').value = row.service_code || '';
    document.getElementById('crp-reason').value = '';
    ['service-day','service-night','service-weekend','asphalt-day','asphalt-night','asphalt-weekend','dirt-day','dirt-night','dirt-weekend','storage'].forEach(key => setValueField(`crp-${key}`, row[`${key.replaceAll('-','_')}_mode`], row[`${key.replaceAll('-','_')}_value`]));
    document.getElementById('crp-km-section').style.display = row.distance_chargeable ? '' : 'none';
    hideError('crp-error'); open('modal-config-price');
  }

  const readPair = prefix => ({ [`${prefix}_mode`]: input(`crp-${prefix.replaceAll('_','-')}-mode`), [`${prefix}_value`]: input(`crp-${prefix.replaceAll('_','-')}-value`) || null });

  async function savePrice() {
    if (!S.priceEdit) return;
    const from = input('crp-from'); if (!from) return showError('crp-error', 'Ingresá la vigencia.');
    const payload = { company_id: S.companyId, billing_base_id: S.baseId || null, concept_id: S.priceEdit.concept_id, valid_from: from, valid_until: input('crp-until') || null, currency: S.priceEdit.currency || 'ARS', service_code: input('crp-code'), change_reason: input('crp-reason'), ...readPair('service_day'), ...readPair('service_night'), ...readPair('service_weekend'), ...readPair('asphalt_day'), ...readPair('asphalt_night'), ...readPair('asphalt_weekend'), ...readPair('dirt_day'), ...readPair('dirt_night'), ...readPair('dirt_weekend'), ...readPair('storage') };
    if (!S.priceEdit.distance_chargeable) {
      ['asphalt_day','asphalt_night','asphalt_weekend','dirt_day','dirt_night','dirt_weekend'].forEach(k => { payload[`${k}_mode`] = 'not_applicable'; payload[`${k}_value`] = null; });
    }
    const result = await _db.rpc('save_company_service_price_version_v2', { p_payload: payload });
    if (result.error) return showError('crp-error', result.error.message);
    close('modal-config-price'); notify('Nueva versión de tarifa creada', 'success'); await loadMatrix();
  }

  async function openHistory(conceptId) {
    const row = S.matrix.find(x => x.concept_id === conceptId); if (!row || !S.companyId) return;
    document.getElementById('crh-title').textContent = `Historial · ${row.service_name}`;
    document.getElementById('crh-body').innerHTML = '<div class="cr-empty">Cargando…</div>'; open('modal-config-price-history');
    const result = await _db.rpc('get_company_service_price_history_v2', { p_company_id: S.companyId, p_base_id: S.baseId || null, p_concept_id: conceptId });
    if (result.error) { document.getElementById('crh-body').innerHTML = `<div class="cr-empty">${esc(result.error.message)}</div>`; return; }
    const rows = Array.isArray(result.data) ? result.data : [];
    document.getElementById('crh-body').innerHTML = rows.length ? `<table class="cr-history-table"><thead><tr><th>Vigencia</th><th>Rev.</th><th>Servicio día</th><th>Servicio noche</th><th>Asfalto D/N</th><th>Ripio D/N</th><th>Estado</th><th>Motivo</th></tr></thead><tbody>${rows.map(h => `<tr><td>${dateFmt(h.valid_from)}</td><td>${h.revision}</td><td>${modeValue(h.service_day_mode,h.service_day_value,h.currency)}</td><td>${modeValue(h.service_night_mode,h.service_night_value,h.currency)}</td><td>${modeValue(h.asphalt_day_mode,h.asphalt_day_value,h.currency)} / ${modeValue(h.asphalt_night_mode,h.asphalt_night_value,h.currency)}</td><td>${modeValue(h.dirt_day_mode,h.dirt_day_value,h.currency)} / ${modeValue(h.dirt_night_mode,h.dirt_night_value,h.currency)}</td><td><span class="cr-pill ${h.is_current ? 'ok' : 'muted'}">${h.is_current ? 'Actual' : 'Histórica'}</span></td><td>${esc(h.change_reason || '—')}</td></tr>`).join('')}</tbody></table>` : '<div class="cr-empty">Sin historial.</div>';
  }

  function showError(id, message) { const el = document.getElementById(id); if (el) { el.textContent = `⚠ ${message}`; el.style.display = 'block'; } }
  function hideError(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

  inject(); applyRole();
  Object.assign(window, {
    cargarConfiguracionReferencia: loadAll,
    renderTiposServicioConfig: renderServices,
    abrirTipoServicioConfig: openService,
    guardarTipoServicioConfig: saveService,
    abrirTipoTarifaConfig: openTariffType,
    guardarTipoTarifaConfig: saveTariffType,
    cambiarEmpresaTarifasConfig: changeCompany,
    cambiarBaseTarifasConfig: async id => { S.baseId = id || null; await loadMatrix(); },
    cambiarFechaTarifasConfig: async value => { S.asOf = value || new Date().toISOString().slice(0,10); await loadMatrix(); },
    cargarMatrizTarifasConfig: loadMatrix,
    renderMatrizTarifasConfig: renderMatrix,
    abrirServiciosPrestadoraConfig: openProviderServices,
    guardarServiciosPrestadoraConfig: saveProviderServices,
    abrirVersionPrecioConfig: openPrice,
    actualizarModoValorTarifaConfig: updateMode,
    guardarVersionPrecioConfig: savePrice,
    abrirHistorialPrecioConfig: openHistory,
  });
  window.addEventListener('auxilios:profile-ready', () => { applyRole(); loadAll(); });
  setTimeout(() => { applyRole(); if (canRead()) loadAll(); }, 1200);
})();
