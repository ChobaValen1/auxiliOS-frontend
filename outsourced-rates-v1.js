/* AuxiliOS · Tercerizados (paso 2): tarifas con vigencia, en la pestaña «Tarifas» de la ficha.
   Lee public.outsourced_rate_versions y guarda con save_outsourced_rate_version_v1, que vuelve a validar todo.
   · Cada tarifa vale desde una fecha; la siguiente la reemplaza. Arriba se ve cuál está vigente.
   · «Nueva tarifa desde…» copia la vigente: sólo se cambian los precios que suben, y cada cambio
     muestra el precio anterior.
   · Tipo de servicio: interruptor «Lo hace» + Movida y km, o Monto fijo. Adicionales: importe por unidad.
   · Abajo se ve qué falta o cuántos cambios hay; Guardar se habilita sólo con cambios. */
(function (global) {
  'use strict';
  var UNIT = { hour: 'hora', km: 'km', day: 'día', unit: 'unidad', service: 'servicio' };
  var st = { el: null, provider: null, concepts: [], versions: [], sel: null, draft: null, orig: null, base: null, tried: false, saving: false, onChange: null };

  function db() { return typeof _db !== 'undefined' ? _db : null; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n) { return '<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#' + n + '"/></svg>'; }
  function notify(m, t) { if (typeof global.toast === 'function') global.toast(m, t || 'info'); }
  /* Acepta 1500, 1.500, 1500,50 y 1.500,50. */
  function num(v) {
    var s = String(v == null ? '' : v).replace(/[$\s]/g, '');
    if (s === '') return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = Number(s); return Number.isFinite(n) ? n : NaN;
  }
  function txt(n) { return n == null || n === '' || !Number.isFinite(Number(n)) ? '' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(n)); }
  function money(n) { return '$ ' + txt(n); }
  function iso(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d); }
  function today() { return iso(new Date()); }
  function fmt(isoDate) { var m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : '—'; }
  function nextMonthFirst() { var t = today().split('-').map(Number), y = t[0], m = t[1] + 1; if (m > 12) { m = 1; y++; } return y + '-' + String(m).padStart(2, '0') + '-01'; }
  function addDays(isoDate, n) { var d = new Date(isoDate + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  function primaries() { return st.concepts.filter(function (c) { return c.service_category === 'primary' || c.service_category === 'mixed'; }); }
  function extras() { return st.concepts.filter(function (c) { return c.service_category === 'secondary' && c.billing_family !== 'sale' && c.input_mode !== 'toggle'; }); }

  /* Borrador editable: un renglón por concepto, con lo que tenga la versión. */
  function toDraft(v) {
    var lines = {}; (v && v.lines || []).forEach(function (l) { lines[l.concept_id] = l; });
    var d = { valid_from: v ? v.valid_from : nextMonthFirst(), tolls_mode: v ? v.tolls_mode : 'separate', rows: {} };
    primaries().forEach(function (c) {
      var l = lines[c.concept_id];
      d.rows[c.concept_id] = { on: !!l, mode: l ? l.calc_mode : 'movida_km', movida: l && l.movida_amount != null ? txt(l.movida_amount) : '', kma: l && l.km_asphalt_amount != null ? txt(l.km_asphalt_amount) : '', kmg: l && l.km_gravel_amount != null ? txt(l.km_gravel_amount) : '', fixed: l && l.fixed_amount != null ? txt(l.fixed_amount) : '' };
    });
    extras().forEach(function (c) { var l = lines[c.concept_id]; d.rows[c.concept_id] = { on: !!l, unit: l ? txt(l.unit_amount) : '' }; });
    return d;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function dirty() { return !!st.draft && JSON.stringify(st.draft) !== JSON.stringify(st.orig); }

  function status(v) {
    var t = today(), sorted = st.versions.slice().sort(function (a, b) { return a.valid_from < b.valid_from ? -1 : 1; });
    var cur = null; sorted.forEach(function (x) { if (x.valid_from <= t) cur = x; });
    if (v.valid_from > t) return { key: 'next', label: 'Programada' };
    if (cur && cur.version_id === v.version_id) return { key: 'current', label: 'Vigente' };
    var after = sorted.find(function (x) { return x.valid_from > v.valid_from; });
    return { key: 'old', label: 'Anterior', until: after ? addDays(after.valid_from, -1) : null };
  }
  function current() { var t = today(), cur = null; st.versions.slice().sort(function (a, b) { return a.valid_from < b.valid_from ? -1 : 1; }).forEach(function (x) { if (x.valid_from <= t) cur = x; }); return cur || st.versions[0] || null; }

  /* ── Validación ─────────────────────────────────────────────────────── */
  function problems(d) {
    var p = {}, any = false;
    if (!d.valid_from) p.valid_from = 'Indicá desde qué fecha vale.';
    else if (st.versions.some(function (v) { return v.valid_from === d.valid_from && v.version_id !== st.sel; })) p.valid_from = 'Ya hay una tarifa desde el ' + fmt(d.valid_from) + '.';
    primaries().forEach(function (c) {
      var r = d.rows[c.concept_id]; if (!r || !r.on) return; any = true;
      if (r.mode === 'fixed') { var f = num(r.fixed); if (!(f > 0)) p[c.concept_id] = Number.isNaN(f) ? 'Revisá el monto.' : 'Cargá el monto fijo.'; }
      else { var a = [num(r.movida), num(r.kma), num(r.kmg)]; if (a.some(function (x) { return Number.isNaN(x) || x < 0; })) p[c.concept_id] = 'Revisá los importes.'; else if (!a.some(function (x) { return x > 0; })) p[c.concept_id] = 'Cargá la movida o el precio por km.'; }
    });
    if (!any) p.none = 'Elegí al menos un tipo de servicio que haga.';
    extras().forEach(function (c) { var r = d.rows[c.concept_id]; if (r && r.on && !(num(r.unit) > 0)) p[c.concept_id] = 'Cargá el importe o apagalo.'; });
    return p;
  }
  function payload(d) {
    var lines = [];
    primaries().forEach(function (c) { var r = d.rows[c.concept_id]; if (!r || !r.on) return; lines.push(r.mode === 'fixed' ? { concept_id: c.concept_id, calc_mode: 'fixed', fixed_amount: num(r.fixed) } : { concept_id: c.concept_id, calc_mode: 'movida_km', movida_amount: num(r.movida) || 0, km_asphalt_amount: num(r.kma) || 0, km_gravel_amount: num(r.kmg) || 0 }); });
    extras().forEach(function (c) { var r = d.rows[c.concept_id]; if (r && r.on) lines.push({ concept_id: c.concept_id, calc_mode: 'per_unit', unit_amount: num(r.unit) }); });
    return { valid_from: d.valid_from, tolls_mode: d.tolls_mode, lines: lines };
  }
  /* Cambios contra la tarifa anterior (al crear una nueva) o contra lo guardado (al editar). */
  function changes() {
    var ref = st.base || st.orig, d = st.draft, n = 0; if (!ref || !d) return 0;
    if (!st.sel && st.base) { Object.keys(d.rows).forEach(function (k) { if (JSON.stringify(d.rows[k]) !== JSON.stringify(ref.rows[k])) n++; }); if (d.tolls_mode !== ref.tolls_mode) n++; return n; }
    Object.keys(d.rows).forEach(function (k) { if (JSON.stringify(d.rows[k]) !== JSON.stringify(st.orig.rows[k])) n++; });
    if (d.tolls_mode !== st.orig.tolls_mode) n++; if (d.valid_from !== st.orig.valid_from) n++;
    return n;
  }
  function wasHtml(cid, field) {
    var ref = st.base; if (!ref || st.sel) return '';
    var a = ref.rows[cid], b = st.draft.rows[cid]; if (!a || !b) return '';
    if (!a.on) return b.on ? '<small class="osr-was">Nuevo</small>' : '';
    if (!b.on) return '<small class="osr-was">Antes lo hacía</small>';
    if (a[field] === b[field] || !a[field]) return '';
    return '<small class="osr-was">Antes ' + esc(money(num(a[field]))) + '</small>';
  }

  /* ── Pantalla ───────────────────────────────────────────────────────── */
  function versionsHtml() {
    if (!st.versions.length && !st.draft) return '';
    var chips = st.versions.slice().sort(function (a, b) { return a.valid_from < b.valid_from ? 1 : -1; }).map(function (v) {
      var s = status(v);
      return '<button type="button" class="osr-ver is-' + s.key + (st.sel === v.version_id ? ' is-on' : '') + '" data-osr-ver="' + esc(v.version_id) + '"><b>Desde ' + fmt(v.valid_from) + '</b><small>' + s.label + (s.until ? ' · hasta ' + fmt(s.until) : '') + '</small></button>';
    }).join('');
    var draftChip = st.draft && !st.sel ? '<span class="osr-ver is-draft is-on"><b>Nueva · desde ' + fmt(st.draft.valid_from) + '</b><small>Sin guardar</small></span>' : '';
    return '<div class="osr-versions" role="group" aria-label="Tarifas">' + draftChip + chips + (st.draft && !st.sel ? '' : '<button type="button" class="ax-btn ax-btn-sm osr-new" data-osr-new>' + ico('plus') + 'Nueva tarifa desde…</button>') + '</div>';
  }
  function moneyInput(cid, field, val, label) {
    return '<label class="osr-money"><span>' + label + '</span><span class="osr-affix"><i>$</i><input class="ax-input" inputmode="decimal" autocomplete="off" data-osr-row="' + esc(cid) + '" data-osr-field="' + field + '" value="' + esc(val) + '" placeholder="0"></span>' + wasHtml(cid, field) + '</label>';
  }
  function primaryRow(c, pr) {
    var r = st.draft.rows[c.concept_id];
    var body = !r.on ? '<p class="osr-off">No lo hace</p>' + wasHtml(c.concept_id, 'on')
      : '<div class="ax-seg osr-mode" role="group" data-osr-mode="' + esc(c.concept_id) + '"><button type="button" data-v="movida_km" aria-pressed="' + (r.mode !== 'fixed') + '">Movida + km</button><button type="button" data-v="fixed" aria-pressed="' + (r.mode === 'fixed') + '">Monto fijo</button></div>'
        + (r.mode === 'fixed' ? '<div class="osr-amounts">' + moneyInput(c.concept_id, 'fixed', r.fixed, 'Monto fijo') + '</div>'
          : '<div class="osr-amounts">' + moneyInput(c.concept_id, 'movida', r.movida, 'Movida') + moneyInput(c.concept_id, 'kma', r.kma, 'Km asfalto') + moneyInput(c.concept_id, 'kmg', r.kmg, 'Km ripio') + '</div>')
        + '<small class="osr-msg">' + esc(pr[c.concept_id] && (st.tried || st.touched[c.concept_id]) ? pr[c.concept_id] : '') + '</small>';
    return '<div class="osr-row' + (r.on ? '' : ' is-off') + (pr[c.concept_id] && (st.tried || st.touched[c.concept_id]) ? ' is-invalid' : '') + '" data-osr-concept="' + esc(c.concept_id) + '"><label class="ax-switch osr-on"><input type="checkbox" data-osr-on="' + esc(c.concept_id) + '"' + (r.on ? ' checked' : '') + '><span><b>' + esc(c.name) + '</b></span></label><div class="osr-row-body">' + body + '</div></div>';
  }
  function extraRow(c, pr) {
    var r = st.draft.rows[c.concept_id], bad = pr[c.concept_id] && (st.tried || st.touched[c.concept_id]);
    return '<div class="osr-extra' + (r.on ? '' : ' is-off') + (bad ? ' is-invalid' : '') + '" data-osr-concept="' + esc(c.concept_id) + '"><label class="ax-switch"><input type="checkbox" data-osr-on="' + esc(c.concept_id) + '"' + (r.on ? ' checked' : '') + '><span>' + esc(c.name) + '</span></label>'
      + (r.on ? '<span class="osr-affix osr-unit"><i>$</i><input class="ax-input" inputmode="decimal" autocomplete="off" data-osr-row="' + esc(c.concept_id) + '" data-osr-field="unit" value="' + esc(r.unit) + '" placeholder="0" aria-label="' + esc(c.name) + ', por ' + esc(UNIT[c.default_pricing_unit] || 'unidad') + '"><em>/ ' + esc(UNIT[c.default_pricing_unit] || 'unidad') + '</em></span>' + wasHtml(c.concept_id, 'unit') : '<span class="osr-off">No se paga</span>')
      + (bad ? '<small class="osr-msg">' + esc(pr[c.concept_id]) + '</small>' : '') + '</div>';
  }
  function render() {
    var el = st.el; if (!el) return;
    if (!st.versions.length && !st.draft) {
      el.innerHTML = '<div class="osr-empty">' + ico('receipt') + '<b>' + esc(st.provider.display_name) + ' todavía no tiene tarifa</b><p>Cargá cuánto se le paga por cada tipo de servicio. Si después cambian los precios, se carga una nueva desde una fecha y los servicios ya hechos no cambian.</p><button type="button" class="ax-btn ax-btn-primary" data-osr-first>' + ico('plus') + 'Cargar la primera tarifa</button></div>';
      el.querySelector('[data-osr-first]').onclick = function () { startNew(); };
      return;
    }
    var d = st.draft, pr = problems(d), s = st.sel ? status(st.versions.find(function (v) { return v.version_id === st.sel; })) : null;
    el.innerHTML = '<div class="osr">' + versionsHtml()
      + (s && s.key !== 'next' ? '<p class="osr-note">' + ico('info') + '<span>' + (s.key === 'current' ? 'Es la tarifa vigente. Si los precios cambian desde una fecha, mejor cargá una <b>nueva tarifa</b>: así los servicios anteriores conservan estos precios.' : 'Es una tarifa anterior. Cambiarla sólo tiene sentido para corregir un error.') + '</span></p>' : '')
      + (!st.sel && st.base ? '<p class="osr-note is-copy">' + ico('copy') + '<span>Copiada de la tarifa vigente. Cambiá sólo lo que sube; al lado de cada precio cambiado ves el anterior.</span></p>' : '')
      + '<section class="osr-head"><label class="osr-field' + (pr.valid_from && (st.tried || st.touched.valid_from) ? ' is-invalid' : '') + '"><span>Vale desde</span><input class="ax-input" type="date" data-osr-from value="' + esc(d.valid_from) + '"><small class="osr-msg">' + esc(pr.valid_from && (st.tried || st.touched.valid_from) ? pr.valid_from : 'Hasta que se cargue otra.') + '</small></label>'
      + '<div class="osr-field"><span>Peajes</span><div class="ax-seg osr-tolls" role="group" data-osr-tolls><button type="button" data-v="separate" aria-pressed="' + (d.tolls_mode === 'separate') + '">Se pagan aparte</button><button type="button" data-v="included" aria-pressed="' + (d.tolls_mode === 'included') + '">Incluidos</button></div><small class="osr-msg">' + (d.tolls_mode === 'separate' ? 'Se suman los peajes que informe en cada servicio.' : 'La tarifa ya cubre los peajes.') + '</small></div></section>'
      + '<section class="osr-block"><h4>Tipos de servicio</h4><p class="osr-hint' + (pr.none && st.tried ? ' is-bad' : '') + '">' + (pr.none && st.tried ? pr.none : 'Encendé los que hace y cargá cómo se le paga cada uno.') + '</p>' + primaries().map(function (c) { return primaryRow(c, pr); }).join('') + '</section>'
      + '<section class="osr-block"><h4>Adicionales</h4><p class="osr-hint">Opcionales. Se pagan por cada hora, km, día o unidad que se cargue en el servicio.</p><div class="osr-extras">' + extras().map(function (c) { return extraRow(c, pr); }).join('') + '</div></section>'
      + '<div role="alert" class="osr-error"></div>'
      + '<footer class="osp-foot osr-foot"><p class="osp-status" data-osr-status aria-live="polite"></p>' + (dirty() || !st.sel ? '<button type="button" class="ax-btn ax-btn-ghost" data-osr-discard>' + (st.sel ? 'Descartar cambios' : 'Cancelar') + '</button>' : '') + '<button type="button" class="ax-btn ax-btn-primary" data-osr-save>' + (st.sel ? 'Guardar cambios' : 'Guardar tarifa') + '</button></footer></div>';
    bind(); paintFoot();
  }
  function paintFoot() {
    var el = st.el, d = st.draft; if (!el || !d) return;
    var pr = problems(d), miss = Object.keys(pr), n = changes(), status = el.querySelector('[data-osr-status]'), save = el.querySelector('[data-osr-save]');
    var editing = !!st.sel, changed = dirty();
    if (status) {
      status.classList.toggle('is-ready', !miss.length && (changed || !editing));
      var names = miss.map(function (k) { if (k === 'valid_from') return 'fecha'; if (k === 'none') return 'un tipo de servicio'; var c = st.concepts.find(function (x) { return x.concept_id === k; }); return c ? c.name : k; });
      status.innerHTML = editing && !changed ? ico('check') + ' Sin cambios' : miss.length ? 'Falta: <b>' + esc(names.join(', ')) + '</b>' : ico('check') + ' Lista' + (n ? ' · ' + n + (n === 1 ? ' cambio' : ' cambios') + (st.base && !editing ? ' contra la vigente' : '') : '');
    }
    if (save) save.disabled = st.saving || (editing && !changed);
    if (typeof st.onChange === 'function') st.onChange(changed);
  }
  function rerenderKeep(sel) {
    var a = document.activeElement, key = a && a.getAttribute && (a.getAttribute('data-osr-row') ? a.getAttribute('data-osr-row') + '|' + a.getAttribute('data-osr-field') : null), pos = a && a.selectionStart;
    render();
    if (key) { var p = key.split('|'), n = st.el.querySelector('[data-osr-row="' + p[0] + '"][data-osr-field="' + p[1] + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* nada */ } } }
    else if (sel) { var m = st.el.querySelector(sel); if (m) m.focus(); }
  }
  function bind() {
    var el = st.el, d = st.draft;
    el.querySelectorAll('[data-osr-ver]').forEach(function (b) { b.onclick = function () { pick(b.getAttribute('data-osr-ver')); }; });
    var nw = el.querySelector('[data-osr-new]'); if (nw) nw.onclick = function () { startNew(); };
    var from = el.querySelector('[data-osr-from]'); if (from) { from.onchange = function () { d.valid_from = from.value; st.touched.valid_from = true; rerenderKeep('[data-osr-from]'); }; }
    var tolls = el.querySelector('[data-osr-tolls]'); if (tolls) tolls.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; d.tolls_mode = b.getAttribute('data-v'); rerenderKeep('[data-osr-tolls] [aria-pressed="true"]'); };
    el.querySelectorAll('[data-osr-on]').forEach(function (i) { i.onchange = function () { var cid = i.getAttribute('data-osr-on'); d.rows[cid].on = i.checked; rerenderKeep(i.checked ? '[data-osr-concept="' + cid + '"] input.ax-input' : '[data-osr-on="' + cid + '"]'); }; });
    el.querySelectorAll('[data-osr-mode]').forEach(function (g) { g.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; var cid = g.getAttribute('data-osr-mode'); d.rows[cid].mode = b.getAttribute('data-v'); rerenderKeep('[data-osr-concept="' + cid + '"] input.ax-input'); }; });
    el.querySelectorAll('[data-osr-row]').forEach(function (i) {
      var cid = i.getAttribute('data-osr-row'), f = i.getAttribute('data-osr-field');
      i.oninput = function () { d.rows[cid][f] = i.value; paintFoot(); };
      i.onblur = function () { var n = num(i.value); if (n != null && !Number.isNaN(n)) { i.value = txt(n); d.rows[cid][f] = i.value; } st.touched[cid] = true; setTimeout(function () { if (!st.el.contains(document.activeElement) || !document.activeElement.getAttribute('data-osr-row')) rerenderKeep(); else { var row = st.el.querySelector('[data-osr-concept="' + cid + '"]'), pr = problems(d); if (row) { row.classList.toggle('is-invalid', !!pr[cid]); var m = row.querySelector('.osr-msg'); if (m) m.textContent = pr[cid] || ''; } paintFoot(); } }, 0); };
      i.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); var all = [].slice.call(st.el.querySelectorAll('[data-osr-row]')), k = all.indexOf(i); if (all[k + 1]) all[k + 1].focus(); } };
    });
    var dis = el.querySelector('[data-osr-discard]'); if (dis) dis.onclick = function () { if (st.sel) { st.draft = clone(st.orig); st.tried = false; st.touched = {}; render(); } else { var c = current(); if (c) pick(c.version_id, true); else { st.draft = null; render(); } } };
    el.querySelector('[data-osr-save]').onclick = save;
  }
  function confirmLeave() { return !dirty() || global.confirm('Tenés cambios sin guardar en la tarifa. ¿Descartarlos?'); }
  function pick(id, quiet) {
    if (!quiet && !confirmLeave()) return;
    var v = st.versions.find(function (x) { return x.version_id === id; }); if (!v) return;
    st.sel = id; st.draft = toDraft(v); st.orig = clone(st.draft); st.base = null; st.tried = false; st.touched = {}; render();
  }
  function startNew() {
    if (!confirmLeave()) return;
    var c = current();
    st.sel = null; st.draft = toDraft(c); st.draft.valid_from = c && c.valid_from >= nextMonthFirst() ? addDays(c.valid_from, 1) : nextMonthFirst();
    st.base = c ? toDraft(c) : null; st.orig = clone(st.draft); st.tried = false; st.touched = {};
    render();
    var f = st.el.querySelector('[data-osr-from]'); if (f) f.focus();
  }
  async function save(e) {
    e.preventDefault(); if (st.saving) return;
    var el = st.el, err = el.querySelector('.osr-error'); err.textContent = '';
    st.tried = true;
    var pr = problems(st.draft);
    if (Object.keys(pr).length) { render(); var first = Object.keys(pr)[0], t = first === 'valid_from' ? st.el.querySelector('[data-osr-from]') : first === 'none' ? st.el.querySelector('[data-osr-on]') : st.el.querySelector('[data-osr-concept="' + first + '"] input'); if (t) t.focus(); return; }
    st.saving = true; paintFoot();
    var btn = el.querySelector('[data-osr-save]'); btn.textContent = 'Guardando…';
    try {
      var r = await db().rpc('save_outsourced_rate_version_v1', { p_provider_id: st.provider.provider_id, p_version_id: st.sel, p_payload: payload(st.draft) });
      if (r.error) throw r.error;
      var row = r.data, i = st.versions.findIndex(function (v) { return v.version_id === row.version_id; });
      if (i >= 0) st.versions[i] = row; else st.versions.push(row);
      var created = !st.sel; st.saving = false; pick(row.version_id, true);
      notify(created ? 'Tarifa guardada: vale desde el ' + fmt(row.valid_from) + '.' : 'Cambios guardados.', 'success');
    } catch (x) { st.saving = false; btn.textContent = st.sel ? 'Guardar cambios' : 'Guardar tarifa'; err.textContent = x.message || 'No se pudo guardar la tarifa.'; paintFoot(); }
  }

  async function mount(el, provider, opts) {
    st.el = el; st.provider = provider; st.onChange = opts && opts.onChange; st.sel = null; st.draft = null; st.orig = null; st.base = null; st.touched = {};
    el.innerHTML = '<div class="osp-loading">Cargando tarifas…</div>';
    try {
      var cs = await db().from('service_concepts').select('concept_id,name,service_category,billing_family,default_pricing_unit,input_mode,is_active,sort_order').eq('is_active', true).order('sort_order').order('name');
      if (cs.error) throw cs.error;
      st.concepts = cs.data || [];
      var vs = await db().from('outsourced_rate_versions').select('*').eq('provider_id', provider.provider_id).order('valid_from', { ascending: false });
      if (vs.error) throw vs.error;
      st.versions = vs.data || [];
    } catch (x) { el.innerHTML = '<div class="osp-loading" role="alert">No se pudieron cargar las tarifas: ' + esc(x.message || x) + '</div>'; return; }
    var c = current(); if (c) pick(c.version_id, true); else render();
  }

  global.AuxTercerizadosTarifas = { mount: mount, dirty: dirty, _num: num, _problems: problems, _toDraft: toDraft, _payload: payload, _state: st };
})(window);
