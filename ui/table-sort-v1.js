/* Orden de tablas al tocar el título de la columna (Servicios, Historial y Facturación).
   Criterio (el mismo de las tablas de datos profesionales):
   · El orden por defecto es la fecha, del más reciente al más viejo.
   · Tocar un título ordena por esa columna: 1.º ascendente (A→Z, menor→mayor, más viejo→más nuevo),
     2.º descendente y 3.º vuelve al orden por defecto. En la columna de fecha alterna entre los dos sentidos.
   · Una sola columna a la vez, orden estable (si empatan, manda la fecha y después el orden original).
   · Números y fechas por su valor, no como texto; textos en español sin distinguir mayúsculas ni tildes y
     con números naturales («B-2» antes que «B-10»). Los vacíos van siempre al final, en los dos sentidos.
   · El título es un botón dentro del <th> con aria-sort, se usa con teclado y se anuncia el cambio.
   · En el celular no hay títulos: se ofrece «Ordenar por» con un selector y un botón de sentido.
   · El orden se recuerda mientras dura la sesión del navegador (sessionStorage), por tabla. */
(function () {
  'use strict';
  if (window.AuxiliosTableSort) return;

  const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true, ignorePunctuation: false });
  const tables = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const storageKey = id => `ax-sort:${id}`;
  const DIR_WORDS = {
    text: { asc: 'A → Z', desc: 'Z → A' },
    number: { asc: 'menor a mayor', desc: 'mayor a menor' },
    date: { asc: 'más viejos primero', desc: 'más recientes primero' }
  };

  const isEmpty = value => value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value));

  /* Pasa el valor crudo a algo comparable según el tipo. Devuelve null si está vacío. */
  function normalize(type, raw) {
    if (isEmpty(raw)) return null;
    if (type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    if (type === 'date') {
      const t = raw instanceof Date ? raw.getTime() : Date.parse(raw);
      return Number.isFinite(t) ? t : null;
    }
    const s = String(raw).trim();
    return s && s !== '—' ? s : null;
  }

  function compareValues(type, a, b) {
    if (type === 'text') return collator.compare(a, b);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /* Ordena una copia. Los vacíos al final; empates por el orden por defecto y después por el índice original. */
  function sortRows(rows, fields, state, defaults) {
    const list = Array.isArray(rows) ? rows : [];
    const primary = fields[state.key];
    const fallback = fields[defaults.key];
    const keyed = list.map((row, index) => ({
      row,
      index,
      a: primary ? normalize(primary.type, primary.get(row)) : null,
      b: fallback && fallback !== primary ? normalize(fallback.type, fallback.get(row)) : null
    }));
    const sign = state.dir === 'asc' ? 1 : -1;
    const fallbackSign = defaults.dir === 'asc' ? 1 : -1;
    keyed.sort((x, y) => {
      if (primary) {
        if (x.a == null && y.a != null) return 1;
        if (y.a == null && x.a != null) return -1;
        if (x.a != null && y.a != null) {
          const c = compareValues(primary.type, x.a, y.a);
          if (c) return sign * c;
        }
      }
      if (fallback && fallback !== primary) {
        if (x.b == null && y.b != null) return 1;
        if (y.b == null && x.b != null) return -1;
        if (x.b != null && y.b != null) {
          const c = compareValues(fallback.type, x.b, y.b);
          if (c) return fallbackSign * c;
        }
      }
      return x.index - y.index;
    });
    return keyed.map(item => item.row);
  }

  /* Ciclo de un título: ascendente → descendente → por defecto. En la columna por defecto, alterna. */
  function nextState(state, key, defaults) {
    if (key === defaults.key) {
      const dir = state.key === key ? (state.dir === 'asc' ? 'desc' : 'asc') : (defaults.dir === 'asc' ? 'desc' : 'asc');
      return { key, dir };
    }
    if (state.key !== key) return { key, dir: 'asc' };
    if (state.dir === 'asc') return { key, dir: 'desc' };
    return { ...defaults };
  }

  const ARROWS = {
    asc: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M6 2.5 9.5 7h-7z" fill="currentColor"/></svg>',
    desc: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M6 9.5 2.5 5h7z" fill="currentColor"/></svg>',
    none: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M6 1.8 8.8 5H3.2zM6 10.2 3.2 7h5.6z" fill="currentColor"/></svg>'
  };

  let live = null;
  function announce(text) {
    if (!document.body) return;
    if (!live || !live.isConnected) {
      live = document.createElement('div');
      live.className = 'ax-sort-live';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 30);
  }

  function create(options) {
    const id = String(options.id);
    const fields = options.fields || {};
    const defaults = { key: options.defaultKey || 'date', dir: options.defaultDir || 'desc' };
    let state = { ...defaults };
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey(id)) || 'null');
      if (saved && fields[saved.key] && (saved.dir === 'asc' || saved.dir === 'desc')) state = saved;
    } catch (_) { /* sin sessionStorage: arranca por defecto */ }

    const describe = s => {
      const f = fields[s.key];
      if (!f) return '';
      const words = f.words || DIR_WORDS[f.type] || DIR_WORDS.text;
      return `${f.label}, ${words[s.dir]}`;
    };

    const api = {
      id,
      fields,
      defaults,
      get state() { return { ...state, isDefault: state.key === defaults.key && state.dir === defaults.dir }; },
      has: key => Boolean(fields[key]),
      apply: rows => sortRows(rows, fields, state, defaults),
      describe: () => describe(state),
      set(next, { silent } = {}) {
        if (!next || !fields[next.key]) next = { ...defaults };
        state = { key: next.key, dir: next.dir === 'asc' ? 'asc' : 'desc' };
        try {
          if (state.key === defaults.key && state.dir === defaults.dir) sessionStorage.removeItem(storageKey(id));
          else sessionStorage.setItem(storageKey(id), JSON.stringify(state));
        } catch (_) { /* nada */ }
        if (!silent) options.onChange?.(api.state);
      },
      toggle(key) { api.set(nextState(state, key, defaults)); },
      reset() { api.set({ ...defaults }); },
      /* Título de columna. Si la columna no ordena, un <th> común con el mismo texto. */
      th(key, label, { className = '', attrs = '' } = {}) {
        const f = fields[key];
        const cls = className ? ` class="${esc(className)}"` : '';
        if (!f) return `<th${cls}${attrs ? ' ' + attrs : ''}>${esc(label)}</th>`;
        const active = state.key === key;
        const sort = active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none';
        const next = nextState(state, key, defaults);
        const hint = next.key === defaults.key && next.dir === defaults.dir && key !== defaults.key
          ? 'Volver al orden por fecha'
          : `Ordenar por ${describe(next)}`;
        const thCls = ` class="${esc([className, 'ax-sort-th', active ? 'is-sorted' : ''].filter(Boolean).join(' '))}"`;
        return `<th${thCls} aria-sort="${sort}"${attrs ? ' ' + attrs : ''}><button type="button" class="ax-sort-btn" data-ax-sort="${esc(id)}" data-ax-sort-key="${esc(key)}" title="${esc(hint)}"><span class="ax-sort-label">${esc(label)}</span><span class="ax-sort-ico${active ? '' : ' is-idle'}">${ARROWS[active ? state.dir : 'none']}</span></button></th>`;
      },
      /* Control del celular: «Ordenar por» + sentido. Se ve sólo donde la tabla pasa a tarjetas (lo decide el CSS). */
      mobile({ className = '', keys: only } = {}) {
        const keys = (Array.isArray(only) ? [...new Set(only)] : Object.keys(fields)).filter(key => fields[key]);
        if (!keys.length) return '';
        if (!keys.includes(state.key)) keys.unshift(state.key);
        const f = fields[state.key];
        const words = f?.words || DIR_WORDS[f?.type] || DIR_WORDS.text;
        const options = keys.map(key => `<option value="${esc(key)}"${key === state.key ? ' selected' : ''}>${esc(fields[key].label)}</option>`).join('');
        const flip = state.dir === 'asc' ? 'desc' : 'asc';
        return `<div class="ax-sort-mobile${className ? ' ' + esc(className) : ''}" role="group" aria-label="Ordenar la lista">
          <label><span>Ordenar por</span><select data-ax-sort-select="${esc(id)}">${options}</select></label>
          <button type="button" class="ax-sort-dir" data-ax-sort-dir="${esc(id)}" aria-label="${esc(`Orden: ${words[state.dir]}. Cambiar a ${words[flip]}`)}" title="${esc(`Cambiar a ${words[flip]}`)}">${ARROWS[state.dir]}<span>${esc(words[state.dir])}</span></button>
        </div>`;
      }
    };
    tables.set(id, api);
    return api;
  }

  function refocus(selector) {
    requestAnimationFrame(() => document.querySelector(selector)?.focus({ preventScroll: true }));
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest?.('[data-ax-sort],[data-ax-sort-dir]');
    if (!btn) return;
    const id = btn.dataset.axSort || btn.dataset.axSortDir;
    const table = tables.get(id);
    if (!table) return;
    event.preventDefault();
    event.stopPropagation();
    if (btn.dataset.axSortDir) {
      const s = table.state;
      table.set({ key: s.key, dir: s.dir === 'asc' ? 'desc' : 'asc' });
      refocus(`[data-ax-sort-dir="${CSS.escape(id)}"]`);
    } else {
      const key = btn.dataset.axSortKey;
      table.toggle(key);
      refocus(`[data-ax-sort="${CSS.escape(id)}"][data-ax-sort-key="${CSS.escape(key)}"]`);
    }
    announce(`Ordenado por ${table.describe()}`);
  });

  document.addEventListener('change', event => {
    const select = event.target.closest?.('[data-ax-sort-select]');
    if (!select) return;
    const id = select.dataset.axSortSelect;
    const table = tables.get(id);
    if (!table) return;
    const key = select.value;
    /* Al elegir un campo: el de por defecto (fecha) arranca en su sentido; el resto, ascendente. */
    table.set({ key, dir: key === table.defaults.key ? table.defaults.dir : 'asc' });
    refocus(`[data-ax-sort-select="${CSS.escape(id)}"]`);
    announce(`Ordenado por ${table.describe()}`);
  });

  window.AuxiliosTableSort = { create, get: id => tables.get(String(id)), _test: { sortRows, nextState, normalize } };
})();
