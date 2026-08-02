/* AuxiliOS · Estrategia de códigos por concepto tarifario */
(() => {
  'use strict';

  function boot() {
    const T = window.TariffEngine;
    if (!T?.S || typeof T.renderServices !== 'function') return false;
    if (T.__codeStrategyPatched) return true;
    T.__codeStrategyPatched = true;

    const S = T.S;
    const baseRenderServices = T.renderServices;
    const baseSaveBranchItem = T.saveBranchItem;
    const esc = T.esc || (value => String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]));

    const categoryOf = concept => {
      if (concept.default_can_be_primary && concept.default_can_be_secondary) return 'mixed';
      if (concept.default_can_be_primary) return 'primary';
      return 'secondary';
    };

    const visibleCatalog = () => {
      const query = String(S.search || '').toLowerCase();
      return S.catalog.filter(concept =>
        (S.filter === 'all' || categoryOf(concept) === S.filter) &&
        (!query || `${concept.name} ${concept.description || ''}`.toLowerCase().includes(query))
      );
    };

    function injectControls(host) {
      const cards = [...host.querySelectorAll('.tc-service')];
      visibleCatalog().forEach((concept, index) => {
        const card = cards[index];
        const item = S.items.find(row =>
          row.concept_id === concept.concept_id && (row.branch_id == null)
        );
        if (!card || !item || card.querySelector('.tc-code-strategy')) return;

        const editable = typeof T.editable === 'function' && T.editable();
        const mode = item.code_mode || 'fixed';
        const wrapper = document.createElement('div');
        wrapper.className = 'tc-code-strategy';
        wrapper.innerHTML = `
          <div class="tc-code-strategy-title">Código operativo del concepto</div>
          <div class="tc-code-strategy-grid">
            <div class="tc-field">
              <label>Código base</label>
              <input class="form-input" value="${esc(item.service_code || concept.code || '')}"
                ${editable ? '' : 'disabled'}
                onchange="actualizarCodigoTarifa('${concept.concept_id}','service_code',this.value)">
            </div>
            <div class="tc-field">
              <label>Comportamiento al crear servicio</label>
              <select class="form-input" ${editable ? '' : 'disabled'}
                onchange="actualizarCodigoTarifa('${concept.concept_id}','code_mode',this.value)">
                <option value="fixed" ${mode === 'fixed' ? 'selected' : ''}>Fijo: usa el código base</option>
                <option value="generated" ${mode === 'generated' ? 'selected' : ''}>Generado: crea uno nuevo</option>
                <option value="manual" ${mode === 'manual' ? 'selected' : ''}>Manual: lo carga el operador</option>
              </select>
            </div>
            ${mode === 'generated' ? `<div class="tc-field tc-code-prefix">
              <label>Prefijo del código generado</label>
              <input class="form-input" value="${esc(item.code_prefix || item.service_code || concept.code || '')}"
                ${editable ? '' : 'disabled'} placeholder="Ej: EXT"
                onchange="actualizarCodigoTarifa('${concept.concept_id}','code_prefix',this.value)">
            </div>` : ''}
          </div>
          <div class="tc-muted tc-code-hint">${
            mode === 'generated'
              ? 'El alta genera: PREFIJO-AAAAMMDD-SECUENCIA.'
              : mode === 'manual'
                ? 'El operador deberá completar el código antes de crear el servicio.'
                : 'Todos los servicios de este concepto usan el mismo código base.'
          }</div>`;
        const branchNote = card.querySelector('.tc-branch-note');
        branchNote ? card.insertBefore(wrapper, branchNote) : card.appendChild(wrapper);
      });
    }

    async function updateCodeStrategy(conceptId, field, value) {
      if (typeof T.editable !== 'function' || !T.editable()) return;
      let normalized = String(value ?? '').trim();
      const patch = {};
      if (field === 'code_mode') {
        if (!['fixed', 'generated', 'manual'].includes(normalized)) return;
        patch.code_mode = normalized;
      } else if (field === 'service_code') {
        normalized = normalized.toUpperCase();
        if (!normalized) return T.notify?.('El código base no puede quedar vacío', 'warning');
        patch.service_code = normalized;
      } else if (field === 'code_prefix') {
        patch.code_prefix = normalized.toUpperCase() || null;
      } else {
        return;
      }

      const response = await _db.from('company_rate_items')
        .update(patch)
        .eq('rate_card_id', S.card.rate_card_id)
        .eq('concept_id', conceptId)
        .select();
      if (response.error) return T.notify?.(response.error.message, 'error');
      const updated = new Map((response.data || []).map(row => [row.rate_item_id, row]));
      S.items = S.items.map(row => updated.get(row.rate_item_id) || row);
      T.renderStep();
      T.notify?.('Estrategia de código actualizada', 'success');
    }

    T.renderServices = element => {
      baseRenderServices(element);
      injectControls(element);
    };

    if (typeof baseSaveBranchItem === 'function') {
      T.saveBranchItem = async (...args) => {
        const conceptId = S.form?.conceptId;
        await baseSaveBranchItem(...args);
        if (!conceptId || !S.card?.rate_card_id) return;
        const general = S.items.find(row => row.concept_id === conceptId && row.branch_id == null);
        if (!general) return;
        const response = await _db.from('company_rate_items')
          .update({
            service_code: general.service_code,
            code_mode: general.code_mode || 'fixed',
            code_prefix: general.code_prefix || null
          })
          .eq('rate_card_id', S.card.rate_card_id)
          .eq('concept_id', conceptId)
          .not('branch_id', 'is', null)
          .select();
        if (!response.error) {
          const updated = new Map((response.data || []).map(row => [row.rate_item_id, row]));
          S.items = S.items.map(row => updated.get(row.rate_item_id) || row);
        }
      };
    }

    window.actualizarCodigoTarifa = updateCodeStrategy;
    return true;
  }

  if (!boot()) {
    const timer = setInterval(() => {
      if (boot()) clearInterval(timer);
    }, 200);
    setTimeout(() => clearInterval(timer), 15000);
  }
})();
