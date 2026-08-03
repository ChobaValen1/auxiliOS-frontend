/* AuxiliOS · Bases de facturación con igual jerarquía */
(() => {
  'use strict';

  const state = {
    companyId: null,
    cache: new Map(),
    patching: false,
    timer: null,
  };

  const role = () => String(typeof PERFIL_USUARIO === 'undefined'
    ? ''
    : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const canSeeCommercial = () => ['administracion', 'facturacion'].includes(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const money = (value, currency = 'ARS') => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(Number(value || 0));
  const hasPrice = row => Boolean(row?.valid_from) && (
    row.service_day_value != null
    || row.service_day_mode === 'automatic'
    || row.asphalt_day_value != null
    || row.asphalt_day_mode === 'automatic'
  );

  function tariffValue(mode, value, currency) {
    if (mode === 'automatic') return '<span class="empv2-chip blue">Auto</span>';
    if (mode === 'not_applicable' || value == null) return '—';
    return `<b>${money(value, currency || 'ARS')}</b>`;
  }

  async function loadCompanyData(companyId, force = false) {
    if (!companyId || typeof _db === 'undefined') return null;
    if (!force && state.cache.has(companyId)) return state.cache.get(companyId);

    const promise = (async () => {
      const billingResult = await _db.rpc('get_company_billing_configuration', {
        p_company_id: companyId,
        p_scheduled_for: new Date().toISOString(),
      });
      if (billingResult.error) throw billingResult.error;

      const bases = (billingResult.data?.links || [])
        .filter(base => base.is_active !== false && base.base_active !== false)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));

      const matrixResults = await Promise.all(bases.map(async base => {
        const result = await _db.rpc('list_company_tariff_matrix_v2', {
          p_company_id: companyId,
          p_base_id: base.base_id,
          p_as_of: new Date().toISOString().slice(0, 10),
        });
        if (result.error) return { base, rows: [], error: result.error };
        return {
          base,
          rows: (Array.isArray(result.data) ? result.data : []).map(row => ({
            ...row,
            base_id: base.base_id,
            base_name: base.name,
            base_code: base.base_code,
          })),
          error: null,
        };
      }));

      const matrix = matrixResults.flatMap(result => result.rows);
      const coveredBaseIds = new Set(
        matrix.filter(hasPrice).map(row => String(row.base_id))
      );
      const coveredBases = bases.filter(base => coveredBaseIds.has(String(base.base_id))).length;

      return {
        setting: billingResult.data?.setting || null,
        bases,
        matrix,
        coveredBases,
        completeTariffs: bases.length > 0 && coveredBases === bases.length,
      };
    })();

    state.cache.set(companyId, promise);
    try {
      const data = await promise;
      state.cache.set(companyId, data);
      return data;
    } catch (error) {
      state.cache.delete(companyId);
      console.warn('[bases iguales] No se pudo cargar la cobertura:', error);
      return null;
    }
  }

  function replaceExactText(root, from, to) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.nodeValue?.trim() === from) {
        const leading = node.nodeValue.match(/^\s*/)?.[0] || '';
        const trailing = node.nodeValue.match(/\s*$/)?.[0] || '';
        node.nodeValue = `${leading}${to}${trailing}`;
      }
    });
  }

  function removeColumnsByHeader(table, labels) {
    if (!table) return;
    const headers = [...table.querySelectorAll('thead th')];
    const indexes = headers
      .map((header, index) => labels.includes(header.textContent.trim()) ? index : -1)
      .filter(index => index >= 0)
      .sort((a, b) => b - a);
    if (!indexes.length) return;
    table.querySelectorAll('tr').forEach(row => {
      indexes.forEach(index => row.children[index]?.remove());
    });
  }

  function patchStaticLanguage(root) {
    replaceExactText(root, 'Base principal', 'Bases habilitadas');
    replaceExactText(root, 'La base principal y las adicionales están disponibles.', 'Todas las bases habilitadas están disponibles con la misma jerarquía.');
    replaceExactText(root, 'No existen tarifas vigentes para la base principal.', 'No existen tarifas vigentes para las bases habilitadas.');

    root.querySelectorAll('.empv2-section-card').forEach(section => {
      const heading = section.querySelector('h3')?.textContent.trim();
      if (heading !== 'Bases y facturación') return;
      removeColumnsByHeader(section.querySelector('table'), ['Prioridad', 'Principal']);
    });
  }

  function patchCompanyRow(row, data) {
    const cells = row.querySelectorAll(':scope > td');
    if (cells.length < 7 || !data) return;
    const signature = `${data.bases.length}:${data.coveredBases}:${data.completeTariffs}`;
    if (row.dataset.equalBasesSignature === signature) return;

    cells[2].innerHTML = data.bases.length
      ? `<span class="empv2-chip blue">${data.bases.length} ${data.bases.length === 1 ? 'base' : 'bases'}</span>`
      : '<span class="empv2-chip red">Sin base</span>';

    cells[4].innerHTML = data.completeTariffs
      ? '<span class="empv2-tariff ok">Vigente en todas</span>'
      : data.coveredBases
        ? `<span class="empv2-tariff bad">${data.coveredBases} de ${data.bases.length}</span>`
        : '<span class="empv2-tariff bad">Sin tarifario</span>';

    if (data.bases.length && !data.completeTariffs) {
      cells[6].innerHTML = `<span class="empv2-alert">⚠ Tarifas pendientes en ${data.bases.length - data.coveredBases} base(s)</span>`;
    }
    row.dataset.equalBasesSignature = signature;
  }

  async function patchList(root) {
    const rows = [...root.querySelectorAll('.empv2-table tbody tr[onclick*="seleccionarEmpresaV2"]')];
    await Promise.all(rows.map(async row => {
      const match = row.getAttribute('onclick')?.match(/seleccionarEmpresaV2\('([^']+)'\)/);
      if (!match) return;
      const data = await loadCompanyData(match[1]);
      patchCompanyRow(row, data);
    }));
  }

  function setTextIfChanged(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function patchBaseSummary(root, data) {
    if (!data) return;

    root.querySelectorAll('.empv2-hero-stat').forEach(stat => {
      const label = stat.querySelector('small');
      if (label?.textContent.trim() !== 'Bases habilitadas') return;
      setTextIfChanged(stat.querySelector('b'), String(data.bases.length));
    });

    root.querySelectorAll('.empv2-contract-strip .empv2-info').forEach(card => {
      const label = card.querySelector('small');
      if (label?.textContent.trim() !== 'Bases habilitadas') return;
      setTextIfChanged(card.querySelector('b'), `${data.bases.length} vinculada${data.bases.length === 1 ? '' : 's'}`);
    });

    root.querySelectorAll('.empv2-rule-grid article').forEach(card => {
      const label = card.querySelector('b');
      if (label?.textContent.trim() !== 'Bases habilitadas') return;
      setTextIfChanged(card.querySelector('small'), String(data.bases.length));
    });
  }

  function patchBasesTable(root, data) {
    const section = [...root.querySelectorAll('.empv2-section-card')]
      .find(item => item.querySelector('h3')?.textContent.trim() === 'Bases y facturación');
    const table = section?.querySelector('table');
    if (!table || !data) return;

    const signature = data.bases
      .map(base => `${base.base_id}:${base.address_verified}:${base.is_active}`)
      .join('|');
    if (table.dataset.equalBasesSignature === signature) return;

    table.innerHTML = `<thead><tr><th>Base</th><th>Código</th><th>Estado</th><th>Coordenadas</th></tr></thead><tbody>${data.bases.length
      ? data.bases.map(base => `<tr><td><b>${esc(base.name)}</b><small>${esc(base.address || '')}</small></td><td>${esc(base.base_code || '—')}</td><td><span class="empv2-status active"><i></i>Habilitada</span></td><td>${base.address_verified ? '<span class="empv2-tariff ok">Verificadas</span>' : '<span class="empv2-tariff bad">Pendientes</span>'}</td></tr>`).join('')
      : '<tr><td colspan="4"><div class="empv2-empty">No hay bases vinculadas.</div></td></tr>'}</tbody>`;
    table.dataset.equalBasesSignature = signature;
  }

  function patchTariffsTable(root, data) {
    const section = [...root.querySelectorAll('.empv2-section-card')]
      .find(item => item.querySelector('h3')?.textContent.trim() === 'Tarifas vigentes');
    const table = section?.querySelector('table');
    if (!table || !data) return;

    const rows = data.matrix;
    const signature = rows.map(row => [
      row.base_id,
      row.service_code,
      row.valid_from,
      row.service_day_mode,
      row.service_day_value,
      row.service_night_mode,
      row.service_night_value,
      row.asphalt_day_mode,
      row.asphalt_day_value,
    ].join(':')).join('|');
    if (table.dataset.equalBasesSignature === signature) return;

    table.innerHTML = `<thead><tr><th>Servicio</th><th>Base</th><th>Vigencia</th><th>Servicio día</th><th>Servicio noche</th><th>KM asfalto</th><th>Estado</th></tr></thead><tbody>${rows.length
      ? rows.map(row => `<tr><td><b>${esc(row.service_name)}</b><small>${esc(row.service_code || '')}</small></td><td><b>${esc(row.base_name || '—')}</b><small>${esc(row.base_code || '')}</small></td><td>${esc(row.valid_from || '—')}</td><td>${canSeeCommercial() ? tariffValue(row.service_day_mode, row.service_day_value, row.currency) : 'Protegido por rol'}</td><td>${canSeeCommercial() ? tariffValue(row.service_night_mode, row.service_night_value, row.currency) : 'Protegido por rol'}</td><td>${canSeeCommercial() ? tariffValue(row.asphalt_day_mode, row.asphalt_day_value, row.currency) : 'Protegido por rol'}</td><td><span class="empv2-tariff ${hasPrice(row) ? 'ok' : 'bad'}">${hasPrice(row) ? 'Vigente' : 'Pendiente'}</span></td></tr>`).join('')
      : '<tr><td colspan="7"><div class="empv2-empty">No existen tarifas vigentes para las bases habilitadas.</div></td></tr>'}</tbody>`;
    table.dataset.equalBasesSignature = signature;
  }

  async function patchDetail(root) {
    if (!state.companyId) return;
    const data = await loadCompanyData(state.companyId);
    if (!document.body.contains(root)) return;
    patchBaseSummary(root, data);
    patchBasesTable(root, data);
    patchTariffsTable(root, data);
  }

  async function patch() {
    const root = document.getElementById('empv2-root');
    if (!root || state.patching) return;
    state.patching = true;
    try {
      patchStaticLanguage(root);
      if (root.querySelector('.empv2-detail-page')) await patchDetail(root);
      else await patchList(root);
    } finally {
      state.patching = false;
    }
  }

  function schedulePatch() {
    clearTimeout(state.timer);
    state.timer = setTimeout(patch, 40);
  }

  function wrap(name, before, after) {
    const original = window[name];
    if (typeof original !== 'function' || original.__equalBasesWrapped) return false;
    const wrapped = async function(...args) {
      before?.(...args);
      const result = await original.apply(this, args);
      after?.(...args);
      schedulePatch();
      return result;
    };
    wrapped.__equalBasesWrapped = true;
    window[name] = wrapped;
    return true;
  }

  function installWrappers() {
    wrap('seleccionarEmpresaV2', companyId => { state.companyId = companyId; });
    wrap('seleccionarEmpresa', companyId => { state.companyId = companyId; });
    wrap('abrirTabEmpresaV2');
    wrap('cargarEmpresasV2', () => state.cache.clear());
    wrap('renderEmpresasV2');
    wrap('volverEmpresasV2', null, () => { state.companyId = null; });
  }

  function init() {
    let attempts = 0;
    const timer = setInterval(() => {
      installWrappers();
      if (document.getElementById('empv2-root') || ++attempts > 60) {
        clearInterval(timer);
        const root = document.getElementById('empv2-root');
        if (root) new MutationObserver(schedulePatch).observe(root, { childList: true, subtree: true });
        schedulePatch();
      }
    }, 200);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
