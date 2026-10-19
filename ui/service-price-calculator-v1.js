/* Cálculo local de presupuestos. No consulta ni modifica datos o tarifas. */
(function (global) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => '$ ' + value.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
  const quantity = value => value.toLocaleString('es-AR', {maximumFractionDigits:3});

  function decimal(value, label) {
    if (value == null || value === '') return 0;
    if (typeof value === 'string') {
      let text = value.trim();
      if (!text) return 0;
      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, '');
      else if (!/^\d+([.,]\d+)?$/.test(text)) throw Error('Revisá ' + label + ': usá un número positivo o cero.');
      value = Number(text.replace(',', '.'));
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw Error('Revisá ' + label + ': usá un número positivo o cero.');
    if (!Number.isSafeInteger(Math.round(value * 1000)) || Math.abs(value * 1000 - Math.round(value * 1000)) > .00001) throw Error('Revisá ' + label + ': admitimos hasta tres decimales y una cantidad válida.');
    return value;
  }
  function cents(value, label) {
    const n = decimal(value, label), result = Math.round((n + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(result) || Math.abs(n * 100 - result) > .00001) throw Error('Revisá ' + label + ': admitimos hasta dos decimales y un importe válido.');
    return result;
  }
  function calculate(draft = {}) {
    const mode = draft.mode || 'distance', lines = [];
    const add = (label, units, rate) => {
      const product = Math.round(units * 1000) * rate;
      if (!Number.isSafeInteger(product)) throw Error('El importe es demasiado grande.');
      const amount = Math.round(product / 1000);
      if (!Number.isSafeInteger(amount)) throw Error('El importe es demasiado grande.');
      lines.push({label, quantity:units, unit_price:rate / 100, subtotal:amount / 100, cents:amount});
    };
    if (mode === 'distance') {
      add('Movida', 1, cents(draft.movement, 'el precio de movida'));
      add('KM asfalto', decimal(draft.asphalt_km, 'los km de asfalto'), cents(draft.asphalt_rate, 'la tarifa de asfalto'));
      add('KM ripio', decimal(draft.gravel_km, 'los km de ripio'), cents(draft.gravel_rate, 'la tarifa de ripio'));
    } else if (mode === 'fixed') add('Monto fijo', 1, cents(draft.fixed_amount, 'el monto fijo'));
    else if (mode === 'service') add('Por servicio', decimal(draft.service_quantity, 'la cantidad de servicios'), cents(draft.service_rate, 'el precio por servicio'));
    else throw Error('Elegí una modalidad de cálculo válida.');
    for (const [i, item] of (draft.items || []).entries()) {
      if (!['toll','extra'].includes(item.kind)) throw Error('Tipo de adicional inválido.');
      add(String(item.name || (item.kind === 'toll' ? 'Peaje' : 'Adicional') + ' ' + (i + 1)).trim(), decimal(item.quantity, 'la cantidad del adicional'), cents(item.unit_price, 'el precio del adicional'));
    }
    const totalCents = lines.reduce((sum, line) => sum + line.cents, 0);
    if (!Number.isSafeInteger(totalCents)) throw Error('El importe total es demasiado grande.');
    return {mode, lines, total:totalCents / 100, budget:Math.round(totalCents / 100)};
  }
  function initial(route = {}) {
    return {mode:'distance', movement:'', asphalt_km:route.estimated_asphalt_km ?? route.estimated_distance_km ?? '', asphalt_rate:'', gravel_km:route.estimated_gravel_km ?? '', gravel_rate:'', fixed_amount:'', service_quantity:'1', service_rate:'', items:[]};
  }
  function field(key, label, value) {
    const text = typeof value === 'number' ? value.toLocaleString('es-AR', {maximumFractionDigits:6}) : value;
    return '<label class="ax-field"><span>' + esc(label) + '</span><input class="ax-input" type="text" inputmode="decimal" data-price-key="' + key + '" value="' + esc(text) + '" autocomplete="off" placeholder="0"></label>';
  }
  function render(draft) {
    const mode = draft.mode || 'distance';
    return '<div class="spc" id="psv-calculator" data-price-calculator><div class="spc-heading"><h4 id="psv-calculator-title">Calcular presupuesto</h4><button type="button" class="ax-btn ax-btn-ghost ax-btn-sm" data-psv="calculator-close">Cerrar cálculo</button></div>' +
      '<p class="spc-note">No agrega IVA, recargos ni kilómetros de regreso automáticamente.</p>' +
      '<div class="spc-columns"><section class="spc-editor" aria-labelledby="spc-mode-title"><h5 id="spc-mode-title">Modalidad</h5><select class="ax-select spc-mode" data-price-key="mode" aria-labelledby="spc-mode-title">' + [['distance','Movida + kilómetros'],['fixed','Monto fijo'],['service','Precio por servicio']].map(([key,label]) => '<option value="' + key + '"' + (mode === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select>' +
      '<div class="spc-grid"' + (mode !== 'distance' ? ' hidden' : '') + '>' + field('movement','Movida · $',draft.movement) + '<span></span>' + field('asphalt_km','KM asfalto a cobrar',draft.asphalt_km) + field('asphalt_rate','Precio por KM asfalto · $',draft.asphalt_rate) + field('gravel_km','KM ripio a cobrar',draft.gravel_km) + field('gravel_rate','Precio por KM ripio · $',draft.gravel_rate) + '</div>' +
      '<div class="spc-grid"' + (mode !== 'fixed' ? ' hidden' : '') + '>' + field('fixed_amount','Monto fijo · $',draft.fixed_amount) + '<p class="spc-note">Reemplaza movida y kilómetros. Los peajes y adicionales de abajo se suman aparte.</p></div>' +
      '<div class="spc-grid"' + (mode !== 'service' ? ' hidden' : '') + '>' + field('service_quantity','Cantidad de servicios',draft.service_quantity) + field('service_rate','Precio por servicio · $',draft.service_rate) + '</div>' +
      '<div class="spc-extras-heading"><h5>Peajes y adicionales</h5><div class="spc-actions"><button type="button" class="ax-btn ax-btn-sm" data-psv="calculator-toll">+ Peaje</button><button type="button" class="ax-btn ax-btn-sm" data-psv="calculator-extra">+ Adicional</button></div></div><div class="spc-items">' + (draft.items || []).map((item,i) => '<div class="spc-item" data-price-item="' + i + '" data-kind="' + esc(item.kind) + '"><label class="ax-field spc-item-name"><span>' + (item.kind === 'toll' ? 'Peaje' : 'Adicional') + '</span><input class="ax-input" data-price-item-key="name" maxlength="120" value="' + esc(item.name) + '" placeholder="' + (item.kind === 'toll' ? 'Nombre del peaje' : 'Ej.: espera, maniobra') + '"></label><label class="ax-field"><span>Cantidad</span><input class="ax-input" inputmode="decimal" data-price-item-key="quantity" value="' + esc(item.quantity) + '"></label><label class="ax-field"><span>Precio unitario · $</span><input class="ax-input" inputmode="decimal" data-price-item-key="unit_price" value="' + esc(item.unit_price) + '"></label><button type="button" class="ax-btn ax-btn-ghost ax-btn-sm" data-psv="calculator-remove" data-index="' + i + '" aria-label="Quitar ' + esc(item.name || 'adicional ' + (i+1)) + '">×</button></div>').join('') + '</div>' +
      '</section><section class="spc-summary" aria-labelledby="spc-breakdown-title"><h5 id="spc-breakdown-title">Desglose</h5><div class="spc-breakdown" data-price-breakdown></div>' +
      '<div class="spc-total"><span>Precio total<small>Redondeado al peso</small></span><strong data-price-total aria-live="polite">$ 0,00</strong></div>' +
      '<p class="spc-error" data-price-error role="alert"></p><button type="button" class="ax-btn ax-btn-primary" data-psv="calculator-apply">Usar presupuesto</button>' +
      '<p class="spc-note spc-save-note">Después guardá el servicio. Se registra el total; el desglose de este borrador no se guarda en la base.</p></section></div></div>';
  }
  function read(root) {
    const draft = {items:[]};
    root.querySelectorAll('[data-price-key]').forEach(input => draft[input.dataset.priceKey] = input.value);
    root.querySelectorAll('[data-price-item]').forEach(row => {
      const item = {kind:row.dataset.kind};
      row.querySelectorAll('[data-price-item-key]').forEach(input => item[input.dataset.priceItemKey] = input.value);
      draft.items.push(item);
    });
    return draft;
  }
  function update(root, minimum = 0) {
    const error = root.querySelector('[data-price-error]'), summary = root.querySelector('[data-price-breakdown]'), total = root.querySelector('[data-price-total]'), apply = root.querySelector('[data-psv="calculator-apply"]');
    try {
      const result = calculate(read(root));
      summary.innerHTML = '<dl>' + result.lines.filter(line => line.subtotal > 0).map(line => '<div><dt>' + esc(line.label) + '<small>' + quantity(line.quantity) + ' × ' + money(line.unit_price) + '</small></dt><dd>' + money(line.subtotal) + '</dd></div>').join('') + '</dl>';
      if (!result.lines.some(line => line.subtotal > 0)) summary.innerHTML = '<p class="spc-empty">Completá los importes para ver el detalle.</p>';
      total.textContent = money(result.budget);
      error.textContent = result.budget < minimum ? 'El presupuesto no puede ser menor a lo ya cobrado (' + money(minimum) + ').' : result.budget <= 0 ? 'Completá precios e importes para obtener un presupuesto mayor a cero.' : '';
      apply.disabled = !!error.textContent;
      return result;
    } catch (e) { error.textContent = e.message; summary.innerHTML = ''; total.textContent = '—'; apply.disabled = true; return null; }
  }
  global.AuxiliosPriceCalculator = {calculate, initial, render, read, update};
})(window);
