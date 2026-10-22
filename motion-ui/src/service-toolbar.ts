const visible = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

// Enhance the existing search and loading signals; filtering and requests stay with Servicios.
export function enhanceServiceToolbar(toolbar: HTMLElement) {
  const search = toolbar.querySelector<HTMLInputElement>('#os-q');
  if (!search?.parentElement) return;
  const field = search.parentElement;
  field.classList.add('ax-search-field');
  if (!search.hasAttribute('aria-label')) search.setAttribute('aria-label', 'Buscar servicios por código, patente, dirección o prestadora');
  search.setAttribute('aria-keyshortcuts', '/');
  search.placeholder = 'Código, patente, cliente, chofer o dirección';
  search.setAttribute('aria-label', 'Buscar servicios por código, patente, cliente, chofer, móvil o dirección');
  const hint = document.createElement('kbd');
  hint.className = 'ax-search-shortcut'; hint.textContent = '/'; hint.setAttribute('aria-hidden', 'true');
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'ax-search-clear';
  clear.setAttribute('aria-label', 'Limpiar búsqueda'); clear.textContent = '×';
  field.append(hint, clear);
  const syncSearch = () => { clear.hidden = !search.value; hint.hidden = !!search.value; };
  const resetSearch = () => {
    search.value = '';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    search.focus();
  };
  clear.addEventListener('click', resetSearch);
  search.addEventListener('input', syncSearch);
  search.addEventListener('search', syncSearch);
  toolbar.closest('.screen')?.addEventListener('auxilios:services-rendered', syncSearch);
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && search.value && !event.isComposing) {
      event.preventDefault(); event.stopPropagation(); resetSearch();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented || !search.isConnected || !visible(search)) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
    if (Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal-backdrop, .ax-backdrop')).some(visible)) return;
    event.preventDefault(); search.focus();
  });
  // Native form reset fires before the browser restores the input value.
  search.form?.addEventListener('reset', () => requestAnimationFrame(syncSearch));
  syncSearch();

  const refresh = toolbar.querySelector<HTMLButtonElement>('#os-refresh');
  if (refresh) {
    const status = document.createElement('span');
    status.className = 'ax-service-loading'; status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    const progress = document.createElement('i');
    progress.className = 'ax-service-progress'; progress.setAttribute('aria-hidden', 'true');
    toolbar.append(status, progress);
    const label = refresh.getAttribute('aria-label');
    let busy = false, wasDisabled = false, table: HTMLElement | null = null, tableBusy: string | null = null;
    const syncLoading = () => {
      const next = refresh.dataset.state === 'loading';
      if (next === busy) return;
      busy = next;
      toolbar.classList.toggle('ax-service-busy', busy);
      if (busy) {
        wasDisabled = refresh.disabled; refresh.disabled = true;
        refresh.setAttribute('aria-busy', 'true'); refresh.setAttribute('aria-label', 'Actualizando servicios');
        table = toolbar.closest('.screen')?.querySelector<HTMLElement>('.os-table-wrap') || null;
        tableBusy = table?.getAttribute('aria-busy') ?? null;
        table?.setAttribute('aria-busy', 'true');
        status.textContent = 'Actualizando servicios…';
      } else {
        refresh.disabled = wasDisabled; refresh.removeAttribute('aria-busy');
        if (label === null) refresh.removeAttribute('aria-label'); else refresh.setAttribute('aria-label', label);
        if (tableBusy === null) table?.removeAttribute('aria-busy'); else table?.setAttribute('aria-busy', tableBusy);
        status.textContent = '';
      }
    };
    new MutationObserver(syncLoading).observe(refresh, {attributes: true, attributeFilter: ['data-state']});
    syncLoading();
  }
  toolbar.querySelectorAll<HTMLButtonElement>('.os-icon-btn').forEach(button => attachHint(button));
}

// Body-mounted hints stay inside the viewport instead of clipping inside filter containers.
let nextHint = 0;
function attachHint(button: HTMLButtonElement) {
  const label = button.dataset.axTip || button.title || button.getAttribute('aria-label');
  if (!label) return;
  button.removeAttribute('title'); button.classList.add('ax-has-hint');
  const tip = document.createElement('div');
  tip.className = 'ax-control-hint'; tip.id = `ax-control-hint-${++nextHint}`;
  tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  let timer = 0, overButton = false, overTip = false, focused = false, dismissed = false;
  const hide = () => {
    clearTimeout(timer); tip.hidden = true;
    const ids = (button.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id);
    if (ids.length) button.setAttribute('aria-describedby', ids.join(' ')); else button.removeAttribute('aria-describedby');
  };
  const show = () => {
    clearTimeout(timer);
    if (dismissed || !button.isConnected || !visible(button)) return;
    tip.textContent = button.getAttribute('aria-busy') === 'true' ? 'Actualizando servicios…' : label;
    if (!tip.isConnected) document.body.append(tip);
    tip.hidden = false;
    const b = button.getBoundingClientRect(), t = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(innerWidth - t.width - 8, b.left + (b.width - t.width) / 2))}px`;
    tip.style.top = `${b.top >= t.height + 16 ? b.top - t.height - 8 : Math.min(innerHeight - t.height - 8, b.bottom + 8)}px`;
    const ids = new Set((button.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(tip.id); button.setAttribute('aria-describedby', [...ids].join(' '));
  };
  const maybeHide = () => { clearTimeout(timer); timer = window.setTimeout(() => { if (!overButton && !overTip && !focused) hide(); }, 120); };
  button.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    overButton = true; dismissed = false; clearTimeout(timer); timer = window.setTimeout(show, 250);
  });
  button.addEventListener('pointerleave', () => { overButton = false; maybeHide(); });
  button.addEventListener('focus', () => { focused = true; dismissed = false; show(); });
  button.addEventListener('blur', () => { focused = false; maybeHide(); });
  button.addEventListener('click', () => { dismissed = true; hide(); });
  tip.addEventListener('pointerenter', () => { overTip = true; clearTimeout(timer); });
  tip.addEventListener('pointerleave', () => { overTip = false; maybeHide(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { dismissed = true; hide(); } });
  // A click into another control or a scroll ends the transient help, without taking focus.
  document.addEventListener('pointerdown', event => { if (!tip.contains(event.target as Node)) { dismissed = true; hide(); } }, true);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}
