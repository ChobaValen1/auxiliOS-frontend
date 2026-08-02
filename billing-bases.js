/* AuxiliOS · Catálogo global de Bases Geográficas */
(() => {
  'use strict';

  const S = {
    bases: [],
    selected: null,
    editing: null,
    suggestions: [],
    suggestionTimer: null,
    sessionToken: null,
    placeDetails: {},
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
  const clean = value => String(value ?? '').trim() || null;
  const notify = (message, type = 'info') => typeof toast === 'function'
    ? toast(message, type)
    : console[type === 'error' ? 'error' : 'log'](message);
  const open = id => typeof openModal === 'function'
    ? openModal(id)
    : document.getElementById(id)?.classList.add('open');
  const close = id => typeof closeModal === 'function'
    ? closeModal(id)
    : document.getElementById(id)?.classList.remove('open');
  const newToken = () => globalThis.crypto?.randomUUID?.()
    || `geo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const current = () => S.bases.find(base => base.base_id === S.selected) || null;

  function inject() {
    if (document.getElementById('screen-bases-geograficas')) return;

    document.head.insertAdjacentHTML('beforeend', `<style id="geo-bases-css">
      #screen-bases-geograficas{padding-bottom:42px}.gb-head,.gb-toolbar,.gb-detail-head,.gb-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.gb-head{margin-bottom:12px}.gb-head h2{margin:0;font:29px 'Bebas Neue',sans-serif;letter-spacing:.6px}.gb-sub{max-width:780px;font-size:11px;line-height:1.45;color:var(--muted)}.gb-notice{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(88,166,255,.28);border-left:3px solid var(--blue);border-radius:9px;background:rgba(88,166,255,.06);font-size:11px;line-height:1.45;color:var(--muted2)}.gb-notice b{color:var(--text)}.gb-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.gb-kpi,.gb-panel,.gb-mini{background:var(--panel);border:1px solid var(--border);border-radius:10px}.gb-kpi{padding:11px 12px}.gb-kpi small{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}.gb-kpi b{display:block;margin-top:4px;font:21px 'DM Mono',monospace}.gb-toolbar{margin-bottom:10px}.gb-toolbar input{flex:1}.gb-toolbar select{min-width:170px}.gb-layout{display:grid;grid-template-columns:minmax(310px,.82fr) minmax(480px,1.5fr);gap:12px}.gb-list{max-height:680px;overflow:auto}.gb-row{padding:12px;border-bottom:1px solid var(--border);cursor:pointer;transition:.15s}.gb-row:last-child{border-bottom:0}.gb-row:hover,.gb-row.active{background:var(--amber-lo)}.gb-row.active{box-shadow:inset 3px 0 var(--amber)}.gb-row-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.gb-row-name{font-size:13px;font-weight:700}.gb-row-code{margin-top:2px;font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:.06em}.gb-row-address{margin-top:7px;font-size:10px;line-height:1.35;color:var(--muted2)}.gb-row-meta{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:8px}.gb-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border:1px solid var(--border);border-radius:999px;font-size:8px;white-space:nowrap}.gb-pill.ok{border-color:rgba(39,196,122,.35);background:rgba(39,196,122,.08);color:var(--green)}.gb-pill.warn{border-color:rgba(245,166,35,.35);background:rgba(245,166,35,.08);color:var(--amber)}.gb-pill.bad{border-color:rgba(226,80,74,.38);background:rgba(226,80,74,.08);color:var(--red)}.gb-pill.info{border-color:rgba(88,166,255,.35);background:rgba(88,166,255,.08);color:var(--blue)}.gb-pill.muted{color:var(--muted)}.gb-detail{padding:16px;min-height:420px}.gb-detail h3{margin:0;font:25px 'Bebas Neue',sans-serif;letter-spacing:.5px}.gb-detail-actions{display:flex;gap:6px;flex-wrap:wrap}.gb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}.gb-mini{padding:10px;background:var(--bg);min-width:0}.gb-mini small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.gb-mini div{margin-top:4px;font-size:10px;line-height:1.35;overflow-wrap:anywhere}.gb-section{margin-top:15px}.gb-section-head{padding-bottom:6px;border-bottom:1px solid var(--border)}.gb-section-head h4{margin:0;font-size:11px}.gb-address-card{margin-top:8px;padding:12px;border:1px solid var(--border);border-radius:9px;background:var(--bg)}.gb-address-card.verified{border-color:rgba(39,196,122,.32)}.gb-address-main{font-size:12px;font-weight:600}.gb-address-sub{margin-top:4px;font-size:10px;color:var(--muted)}.gb-coords{margin-top:8px;font:9px 'DM Mono',monospace;color:var(--muted2)}.gb-empty{padding:32px;text-align:center;color:var(--muted);font-size:11px}.gb-readonly{padding:8px 10px;border:1px solid rgba(88,166,255,.3);border-radius:8px;color:var(--blue);font-size:10px;margin-bottom:10px}.gb-modal{width:min(820px,calc(100vw - 24px));max-width:820px}.gb-modal .modal-body{max-height:min(74vh,690px);overflow:auto}.gb-form-section{margin:2px 0 14px}.gb-form-title{margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--border);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--amber)}.gb-address-field{position:relative}.gb-suggestions{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:100;max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--panel);box-shadow:0 15px 35px rgba(0,0,0,.46)}.gb-suggestions button{display:block;width:100%;padding:9px 10px;border:0;border-bottom:1px solid var(--border);background:transparent;text-align:left;color:var(--text);cursor:pointer}.gb-suggestions button:last-child{border-bottom:0}.gb-suggestions button:hover{background:rgba(255,255,255,.05)}.gb-suggestions b,.gb-suggestions span{display:block;font-size:10px}.gb-suggestions span{margin-top:2px;color:var(--muted)}.gb-geo-state{display:flex;align-items:center;gap:7px;margin-top:6px;padding:6px 8px;border:1px dashed var(--border);border-radius:7px;font-size:9px;color:var(--muted)}.gb-geo-state.ok{border-style:solid;border-color:rgba(39,196,122,.28);background:rgba(39,196,122,.06);color:var(--green)}.gb-geo-state.warn{border-style:solid;border-color:rgba(245,166,35,.28);background:rgba(245,166,35,.06);color:var(--amber)}.gb-check{display:flex;align-items:center;gap:7px;font-size:11px}.gb-help{margin-top:5px;font-size:9px;line-height:1.35;color:var(--muted)}.gb-map-error{display:none;margin-top:6px;font-size:9px;color:var(--amber)}@media(max-width:1050px){.gb-layout{grid-template-columns:1fr}.gb-list{max-height:360px}}@media(max-width:760px){.gb-head,.gb-toolbar,.gb-detail-head{align-items:stretch;flex-direction:column}.gb-kpis,.gb-grid{grid-template-columns:repeat(2,1fr)}.gb-toolbar select{width:100%}.gb-detail-actions{width:100%}.gb-detail-actions .btn{flex:1}}@media(max-width:460px){.gb-kpis,.gb-grid{grid-template-columns:1fr}}
    </style>`);

    const bottom = document.querySelector('.sidenav .nav-bottom');
    bottom?.insertAdjacentHTML('beforebegin', `<div class="nav-item" id="nav-bases-geograficas" onclick="goTo('bases-geograficas')" style="display:none"><span class="nav-icon">📍</span><span class="nav-label">Bases geográficas</span></div>`);

    document.querySelector('.content')?.insertAdjacentHTML('beforeend', `<div class="screen" id="screen-bases-geograficas">
      <div class="gb-head"><div><h2>Bases geográficas</h2><div class="gb-sub">Catálogo reutilizable de puntos de referencia con dirección y coordenadas exactas.</div></div><button class="btn btn-primary gb-write" onclick="abrirBaseGeografica()">＋ Nueva base</button></div>
      <div class="gb-notice"><b>La base no pertenece a una empresa.</b> Acá se administra únicamente el punto geográfico. El modo de facturación y las bases aplicables se configuran dentro de cada empresa.</div>
      <div id="gb-readonly" class="gb-readonly" style="display:none">Acceso de consulta. Solo Administración puede crear o modificar bases.</div>
      <div class="gb-kpis"><div class="gb-kpi"><small>Total</small><b id="gb-kpi-total">0</b></div><div class="gb-kpi"><small>Activas</small><b id="gb-kpi-active">0</b></div><div class="gb-kpi"><small>Google verificadas</small><b id="gb-kpi-verified">0</b></div><div class="gb-kpi"><small>Vínculos con empresas</small><b id="gb-kpi-links">0</b></div></div>
      <div class="gb-toolbar"><input class="form-input" id="gb-q" placeholder="Buscar base, código, localidad o dirección" oninput="renderBasesGeograficas()"><select class="form-input" id="gb-status-filter" onchange="renderBasesGeograficas()"><option value="all">Todos los estados</option><option value="active">Activas</option><option value="verified">Verificadas</option><option value="unverified">Sin verificar</option><option value="inactive">Inactivas</option></select><button class="btn btn-ghost" onclick="cargarBasesGeograficas()">↻</button></div>
      <div class="gb-layout"><div class="gb-panel"><div class="gb-list" id="gb-list"><div class="gb-empty">Cargando…</div></div></div><div class="gb-panel gb-detail" id="gb-detail"><div class="gb-empty">Seleccioná una base geográfica.</div></div></div>
    </div>`);

    document.body.insertAdjacentHTML('beforeend', modalHtml());
  }

  function modalHtml() {
    return `<div class="modal-backdrop" id="modal-geographic-base"><div class="modal-box gb-modal"><div class="modal-head"><span class="modal-head-title" id="gb-modal-title">Nueva base geográfica</span><button class="modal-close" onclick="closeModal('modal-geographic-base')">×</button></div><div class="modal-body">
      <div class="gb-form-section"><div class="gb-form-title">Identificación</div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="gb-name" placeholder="Ej: Base Pinamar"></div><div class="form-group"><label class="form-label">Código interno</label><input class="form-input" id="gb-code" placeholder="Ej: PINAMAR"></div></div>
      </div>
      <div class="gb-form-section"><div class="gb-form-title">Ubicación exacta</div>
        <div class="form-group gb-address-field"><label class="form-label">Dirección *</label><input class="form-input" id="gb-address" placeholder="Empezá a escribir y seleccioná una dirección" oninput="buscarDireccionBaseGeografica()"><div class="gb-suggestions" id="gb-suggestions"></div><div class="gb-map-error" id="gb-map-error"></div></div>
        <div id="gb-geo-state" class="gb-geo-state warn">⚠ Dirección manual. Para usarla en kilometraje automático debe validarse con Google Maps.</div>
        <input type="hidden" id="gb-place-id">
        <div class="form-grid-2" style="margin-top:8px"><div class="form-group"><label class="form-label">Localidad</label><input class="form-input" id="gb-city"></div><div class="form-group"><label class="form-label">Provincia</label><input class="form-input" id="gb-province" value="Buenos Aires"></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Código postal</label><input class="form-input" id="gb-postal"></div><div class="form-group"><label class="form-label">País</label><input class="form-input" id="gb-country" value="Argentina"></div></div>
        <div class="form-grid-2"><div class="form-group"><label class="form-label">Latitud</label><input class="form-input" id="gb-lat" inputmode="decimal" oninput="invalidarDireccionBaseGeografica()"></div><div class="form-group"><label class="form-label">Longitud</label><input class="form-input" id="gb-lng" inputmode="decimal" oninput="invalidarDireccionBaseGeografica()"></div></div>
      </div>
      <div class="gb-form-section"><div class="gb-form-title">Estado</div>
        <label class="gb-check"><input type="checkbox" id="gb-active" checked> Base activa</label>
        <div class="form-group" style="margin-top:10px"><label class="form-label">Observaciones</label><textarea class="form-input" id="gb-notes" rows="3" placeholder="Referencias internas del punto geográfico"></textarea></div>
      </div>
      <div class="modal-error" id="gb-error" style="display:none"></div>
    </div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-geographic-base')">Cancelar</button><button class="btn btn-primary" id="gb-save" onclick="guardarBaseGeografica()">Guardar base</button></div></div></div>`;
  }

  function applyRole() {
    const nav = document.getElementById('nav-bases-geograficas');
    if (nav) nav.style.display = canRead() ? '' : 'none';
    document.querySelectorAll('.gb-write').forEach(element => { element.style.display = canWrite() ? '' : 'none'; });
    const readOnly = document.getElementById('gb-readonly');
    if (readOnly) readOnly.style.display = canRead() && !canWrite() ? '' : 'none';
  }

  async function load() {
    if (!canRead() || S.loading) return;
    S.loading = true;
    const list = document.getElementById('gb-list');
    if (list) list.innerHTML = '<div class="gb-empty">Cargando bases geográficas…</div>';
    try {
      const { data, error } = await _db.rpc('list_geographic_bases', { p_include_inactive: true });
      if (error) throw error;
      S.bases = Array.isArray(data) ? data : [];
      if (S.selected && !S.bases.some(base => base.base_id === S.selected)) S.selected = null;
      if (!S.selected && S.bases.length) S.selected = S.bases[0].base_id;
      render();
      applyRole();
    } catch (error) {
      console.error('[bases geográficas] carga:', error);
      if (list) list.innerHTML = '<div class="gb-empty">No se pudieron cargar las bases.</div>';
      notify(error.message || 'No se pudieron cargar las bases', 'error');
    } finally {
      S.loading = false;
    }
  }

  function filteredBases() {
    const query = (document.getElementById('gb-q')?.value || '').toLowerCase().trim();
    const status = document.getElementById('gb-status-filter')?.value || 'all';
    return S.bases.filter(base => {
      if (status === 'active' && !base.is_active) return false;
      if (status === 'inactive' && base.is_active) return false;
      if (status === 'verified' && !base.address_verified) return false;
      if (status === 'unverified' && base.address_verified) return false;
      if (!query) return true;
      return `${base.name || ''} ${base.base_code || ''} ${base.address || ''} ${base.city || ''} ${base.province || ''}`
        .toLowerCase().includes(query);
    });
  }

  function render() {
    const total = S.bases.length;
    const active = S.bases.filter(base => base.is_active).length;
    const verified = S.bases.filter(base => base.address_verified).length;
    const links = S.bases.reduce((sum, base) => sum + Number(base.companies_count || 0), 0);
    [['total', total], ['active', active], ['verified', verified], ['links', links]].forEach(([key, value]) => {
      const element = document.getElementById(`gb-kpi-${key}`);
      if (element) element.textContent = value;
    });

    const rows = filteredBases();
    const list = document.getElementById('gb-list');
    if (list) {
      list.innerHTML = rows.length ? rows.map(base => {
        const statusClass = !base.is_active ? 'muted' : (base.address_verified ? 'ok' : 'warn');
        const statusLabel = !base.is_active ? 'Inactiva' : (base.address_verified ? 'Google verificada' : 'Sin verificar');
        return `<div class="gb-row ${S.selected === base.base_id ? 'active' : ''}" onclick="seleccionarBaseGeografica('${esc(base.base_id)}')">
          <div class="gb-row-top"><div><div class="gb-row-name">${esc(base.name)}</div><div class="gb-row-code">${esc(base.base_code || 'Sin código')}</div></div><span class="gb-pill ${statusClass}">${statusLabel}</span></div>
          <div class="gb-row-address">${esc(base.address)}${base.city ? ` · ${esc(base.city)}` : ''}</div>
          <div class="gb-row-meta"><span class="gb-pill">${Number(base.companies_count || 0)} empresa${Number(base.companies_count || 0) === 1 ? '' : 's'}</span><span class="gb-pill">${Number(base.services_count || 0)} servicio${Number(base.services_count || 0) === 1 ? '' : 's'}</span></div>
        </div>`;
      }).join('') : '<div class="gb-empty">No hay bases que coincidan con los filtros.</div>';
    }
    renderDetail();
  }

  function renderDetail() {
    const base = current();
    const detail = document.getElementById('gb-detail');
    if (!detail) return;
    if (!base) {
      detail.innerHTML = '<div class="gb-empty">Seleccioná una base geográfica.</div>';
      return;
    }
    const coordinates = base.latitude != null && base.longitude != null
      ? `${Number(base.latitude).toFixed(6)}, ${Number(base.longitude).toFixed(6)}`
      : 'Sin coordenadas';
    detail.innerHTML = `<div class="gb-detail-head"><div><div class="gb-row-code">${esc(base.base_code || 'Punto geográfico')}</div><h3>${esc(base.name)}</h3><div class="gb-row-meta"><span class="gb-pill ${base.is_active ? 'ok' : 'muted'}">${base.is_active ? 'Activa' : 'Inactiva'}</span><span class="gb-pill ${base.address_verified ? 'ok' : 'warn'}">${base.address_verified ? 'Google verificada' : 'Dirección manual'}</span></div></div><div class="gb-detail-actions">${canWrite() ? `<button class="btn btn-ghost" onclick="abrirBaseGeografica('${esc(base.base_id)}')">Editar</button><button class="btn ${base.is_active ? 'btn-ghost' : 'btn-primary'}" onclick="cambiarEstadoBaseGeografica('${esc(base.base_id)}',${base.is_active ? 'false' : 'true'})">${base.is_active ? 'Desactivar' : 'Activar'}</button>` : ''}</div></div>
      <div class="gb-grid"><div class="gb-mini"><small>Empresas vinculadas</small><div>${Number(base.companies_count || 0)}</div></div><div class="gb-mini"><small>Servicios registrados</small><div>${Number(base.services_count || 0)}</div></div><div class="gb-mini"><small>Origen del dato</small><div>${base.address_verified ? 'Google Maps' : 'Carga manual'}</div></div></div>
      <div class="gb-section"><div class="gb-section-head"><h4>Ubicación</h4></div><div class="gb-address-card ${base.address_verified ? 'verified' : ''}"><div class="gb-address-main">${esc(base.address)}</div><div class="gb-address-sub">${esc([base.city, base.province, base.postal_code, base.country].filter(Boolean).join(' · ') || 'Sin datos complementarios')}</div><div class="gb-coords">${esc(coordinates)}${base.google_place_id ? ` · Place ID ${esc(base.google_place_id)}` : ''}</div></div></div>
      <div class="gb-section"><div class="gb-section-head"><h4>Uso del punto</h4></div><div class="gb-notice" style="margin-top:8px;margin-bottom:0">Esta base puede ser reutilizada por varias empresas. Las reglas de recorrido, peajes, prioridad y base predeterminada se administran desde la ficha de cada empresa.</div></div>
      ${base.notes ? `<div class="gb-section"><div class="gb-section-head"><h4>Observaciones</h4></div><div style="margin-top:8px;font-size:11px;line-height:1.5;color:var(--muted2)">${esc(base.notes)}</div></div>` : ''}`;
  }

  function selectBase(id) {
    S.selected = id;
    render();
  }

  async function openEditor(id = null) {
    if (!canWrite()) return notify('Solo Administración puede modificar bases', 'error');
    S.editing = id;
    S.suggestions = [];
    S.placeDetails = {};
    S.sessionToken = newToken();
    hideSuggestions();
    setFormError('');
    setMapError('');

    const base = S.bases.find(item => item.base_id === id) || null;
    document.getElementById('gb-modal-title').textContent = base ? 'Editar base geográfica' : 'Nueva base geográfica';
    const values = {
      'gb-name': base?.name || '',
      'gb-code': base?.base_code || '',
      'gb-address': base?.address || '',
      'gb-city': base?.city || '',
      'gb-province': base?.province || 'Buenos Aires',
      'gb-postal': base?.postal_code || '',
      'gb-country': base?.country || 'Argentina',
      'gb-place-id': base?.google_place_id || '',
      'gb-lat': base?.latitude ?? '',
      'gb-lng': base?.longitude ?? '',
      'gb-notes': base?.notes || '',
    };
    Object.entries(values).forEach(([field, value]) => {
      const element = document.getElementById(field);
      if (element) element.value = value;
    });
    document.getElementById('gb-active').checked = base ? Boolean(base.is_active) : true;
    S.placeDetails = base?.place_details || {};
    setVerifiedState(Boolean(base?.address_verified));
    open('modal-geographic-base');
  }

  function setVerifiedState(verified) {
    const state = document.getElementById('gb-geo-state');
    if (!state) return;
    state.className = `gb-geo-state ${verified ? 'ok' : 'warn'}`;
    state.textContent = verified
      ? '✓ Dirección validada con Google Maps. Place ID y coordenadas quedan guardados.'
      : '⚠ Dirección manual. Para usarla en kilometraje automático debe validarse con Google Maps.';
    state.dataset.verified = verified ? '1' : '0';
  }

  function invalidateGoogle() {
    const state = document.getElementById('gb-geo-state');
    if (state?.dataset.verified !== '1') return;
    document.getElementById('gb-place-id').value = '';
    S.placeDetails = {};
    setVerifiedState(false);
  }

  function searchAddress() {
    invalidateGoogle();
    clearTimeout(S.suggestionTimer);
    const input = document.getElementById('gb-address')?.value.trim() || '';
    if (input.length < 3) return hideSuggestions();
    S.suggestionTimer = setTimeout(() => runAutocomplete(input), 350);
  }

  async function mapsInvoke(body) {
    const { data, error } = await _db.functions.invoke('maps-proxy', { body });
    if (error) throw new Error(error.message || 'No se pudo consultar Google Maps');
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  async function runAutocomplete(input) {
    const box = document.getElementById('gb-suggestions');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<button type="button" disabled>Buscando direcciones…</button>';
    try {
      const data = await mapsInvoke({ action: 'autocomplete', input, sessionToken: S.sessionToken, regionCode: 'AR' });
      S.suggestions = data.suggestions || [];
      box.innerHTML = S.suggestions.length
        ? S.suggestions.map((suggestion, index) => `<button type="button" onclick="seleccionarDireccionBaseGeografica(${index})"><b>${esc(suggestion.mainText || suggestion.text)}</b><span>${esc(suggestion.secondaryText || suggestion.text || '')}</span></button>`).join('')
        : '<button type="button" disabled>No se encontraron coincidencias.</button>';
      setMapError('');
    } catch (error) {
      S.suggestions = [];
      box.style.display = 'none';
      setMapError(`${error.message} Podés guardar manualmente, pero la base no quedará habilitada para cálculo automático.`);
    }
  }

  async function selectSuggestion(index) {
    const suggestion = S.suggestions[index];
    if (!suggestion?.placeId) return;
    try {
      const data = await mapsInvoke({ action: 'place', placeId: suggestion.placeId });
      document.getElementById('gb-address').value = data.formattedAddress || suggestion.text || '';
      document.getElementById('gb-place-id').value = data.placeId || suggestion.placeId;
      document.getElementById('gb-lat').value = data.location?.latitude ?? '';
      document.getElementById('gb-lng').value = data.location?.longitude ?? '';
      if (data.city) document.getElementById('gb-city').value = data.city;
      if (data.province) document.getElementById('gb-province').value = data.province;
      if (data.postalCode) document.getElementById('gb-postal').value = data.postalCode;
      if (data.country) document.getElementById('gb-country').value = data.country;
      S.placeDetails = data;
      setVerifiedState(true);
      setMapError('');
      hideSuggestions();
      S.sessionToken = newToken();
    } catch (error) {
      setMapError(error.message || 'No se pudo validar la dirección seleccionada.');
    }
  }

  function hideSuggestions() {
    const box = document.getElementById('gb-suggestions');
    if (box) {
      box.style.display = 'none';
      box.innerHTML = '';
    }
  }

  function setMapError(message) {
    const element = document.getElementById('gb-map-error');
    if (!element) return;
    element.textContent = message || '';
    element.style.display = message ? 'block' : 'none';
  }

  function setFormError(message) {
    const element = document.getElementById('gb-error');
    if (!element) return;
    element.textContent = message || '';
    element.style.display = message ? 'block' : 'none';
  }

  async function save() {
    if (!canWrite()) return;
    const verified = document.getElementById('gb-geo-state')?.dataset.verified === '1';
    const payload = {
      base_id: S.editing || null,
      name: clean(document.getElementById('gb-name')?.value),
      base_code: clean(document.getElementById('gb-code')?.value),
      address: clean(document.getElementById('gb-address')?.value),
      city: clean(document.getElementById('gb-city')?.value),
      province: clean(document.getElementById('gb-province')?.value) || 'Buenos Aires',
      postal_code: clean(document.getElementById('gb-postal')?.value),
      country: clean(document.getElementById('gb-country')?.value) || 'Argentina',
      latitude: clean(document.getElementById('gb-lat')?.value),
      longitude: clean(document.getElementById('gb-lng')?.value),
      google_place_id: verified ? clean(document.getElementById('gb-place-id')?.value) : null,
      address_verified: verified,
      geocoded_at: verified ? new Date().toISOString() : null,
      place_details: verified ? S.placeDetails : {},
      is_active: Boolean(document.getElementById('gb-active')?.checked),
      notes: clean(document.getElementById('gb-notes')?.value),
    };

    if (!payload.name || payload.name.length < 2) return setFormError('Ingresá el nombre de la base.');
    if (!payload.address || payload.address.length < 3) return setFormError('Ingresá una dirección.');
    if ((payload.latitude && !payload.longitude) || (!payload.latitude && payload.longitude)) return setFormError('Latitud y longitud deben cargarse juntas.');

    const button = document.getElementById('gb-save');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    setFormError('');
    try {
      const { data, error } = await _db.rpc('save_geographic_base', { p_payload: payload });
      if (error) throw error;
      S.selected = data?.base_id || S.selected;
      close('modal-geographic-base');
      notify('Base geográfica guardada', 'success');
      await load();
    } catch (error) {
      console.error('[bases geográficas] guardar:', error);
      setFormError(error.message || 'No se pudo guardar la base.');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Guardar base'; }
    }
  }

  async function changeStatus(id, active) {
    if (!canWrite()) return;
    const base = S.bases.find(item => item.base_id === id);
    if (!confirm(`¿${active ? 'Activar' : 'Desactivar'} la base "${base?.name || ''}"?`)) return;
    try {
      const { error } = await _db.rpc('set_geographic_base_status', { p_base_id: id, p_active: Boolean(active) });
      if (error) throw error;
      notify(`Base ${active ? 'activada' : 'desactivada'}`, 'success');
      await load();
    } catch (error) {
      notify(error.message || 'No se pudo cambiar el estado', 'error');
    }
  }

  function init() {
    inject();
    if (typeof SCREENS !== 'undefined') {
      SCREENS['bases-geograficas'] = { title: 'BASES GEOGRÁFICAS', sub: 'Puntos de referencia reutilizables' };
      SCREENS['bases-tarifarias'] = SCREENS['bases-geograficas'];
    }
    if (typeof goTo === 'function' && !window.__geographicBasesNav) {
      const previous = goTo;
      window.goTo = name => {
        const target = name === 'bases-tarifarias' ? 'bases-geograficas' : name;
        previous(target);
        if (target === 'bases-geograficas') load();
      };
      window.__geographicBasesNav = true;
    }
    document.addEventListener('click', event => {
      if (!event.target.closest('.gb-address-field')) hideSuggestions();
    });
    let attempts = 0;
    const timer = setInterval(() => {
      applyRole();
      if (role() || ++attempts > 40) clearInterval(timer);
    }, 250);
  }

  Object.assign(window, {
    cargarBasesGeograficas: load,
    renderBasesGeograficas: render,
    seleccionarBaseGeografica: selectBase,
    abrirBaseGeografica: openEditor,
    guardarBaseGeografica: save,
    cambiarEstadoBaseGeografica: changeStatus,
    buscarDireccionBaseGeografica: searchAddress,
    seleccionarDireccionBaseGeografica: selectSuggestion,
    invalidarDireccionBaseGeografica: invalidateGoogle,
    cargarBasesTarifarias: load,
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();