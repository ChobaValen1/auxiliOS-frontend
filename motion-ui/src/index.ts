import { animate } from 'motion/mini';
import { spring } from 'motion';
import './style.css';
import { enhanceServiceToolbar } from './service-toolbar';

// Existing application profile: read the shared binding, including its async login update.
declare const PERFIL_USUARIO: { full_name?: string; roles?: { name?: string }; role?: string } | null;

// Progressive enhancement: DOM, permissions, business callbacks and data remain owned by the app.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 767px)');
const running = new Map<HTMLElement, ReturnType<typeof animate>>();
const ease = { type: spring, duration: .48, bounce: .16 };
const visible = (el: HTMLElement) => !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

function enter(el: HTMLElement, from = 'translateY(14px) scale(.98)', delay = 0) {
  running.get(el)?.cancel();
  if (reduced.matches || !visible(el)) return;
  const control = animate(el, { opacity: [.25, 1], transform: [from, 'none'] }, { ...ease, delay });
  running.set(el, control);
  void control.then(() => {
    if (running.get(el) !== control) return;
    control.cancel(); // Never leave transforms on containers of fixed-position menus.
    running.delete(el);
  });
}
reduced.addEventListener('change', () => {
  running.forEach(control => control.cancel()); running.clear();
});

function navigation() {
  const nav = document.querySelector<HTMLElement>('.sidenav');
  if (!nav) return;
  const brand = nav.querySelector<HTMLElement>('.nav-logo');
  const identity = document.createElement('span');
  identity.className = 'ax-nav-user'; identity.hidden = true;
  const userName = document.createElement('span'); userName.className = 'ax-nav-user-name';
  const userRole = document.createElement('span'); userRole.className = 'ax-nav-user-role';
  identity.append(userName, userRole); brand?.append(identity);
  let identityKey = '';
  function syncIdentity() {
    let profile: typeof PERFIL_USUARIO = null;
    try { if (typeof PERFIL_USUARIO !== 'undefined') profile = PERFIL_USUARIO; } catch { /* profile not initialized yet */ }
    const name = String(profile?.full_name || '').trim().replace(/\s+/g, ' ');
    const role = String(profile?.roles?.name || profile?.role || '').trim().toLowerCase();
    const labels: Record<string, string> = { administracion: 'Administración', operador: 'Operador', supervision: 'Supervisión', chofer: 'Chofer', facturacion: 'Facturación' };
    const label = labels[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : '');
    const next = JSON.stringify([name, label]);
    if (next === identityKey) return;
    identityKey = next;
    userName.textContent = name; userRole.textContent = label;
    userRole.hidden = !label; identity.hidden = !name;
    brand?.classList.toggle('ax-nav-account', !!name);
  }
  syncIdentity();
  const pill = document.createElement('i');
  pill.className = 'ax-motion-nav-pill'; pill.setAttribute('aria-hidden', 'true');
  nav.prepend(pill);
  let key = '', frame = 0, hovering = false, keyboardFocus = false;
  let pillMotion: ReturnType<typeof animate> | undefined;
  function position() {
    frame = 0;
    const active = nav!.querySelector<HTMLElement>('.nav-item.active');
    nav!.querySelectorAll('.nav-item').forEach(item => {
      if (item === active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    if (!active || !visible(active)) { pill.hidden = true; key = ''; return; }
    const a = active.getBoundingClientRect(), n = nav!.getBoundingClientRect();
    const next = [a.left - n.left + nav!.scrollLeft, a.top - n.top + nav!.scrollTop, a.width, a.height];
    const nextKey = next.join(',');
    pill.hidden = false;
    if (nextKey === key) return;
    const first = !key; key = nextKey;
    pillMotion?.stop();
    pillMotion = animate(pill, { left: `${next[0]}px`, top: `${next[1]}px`, width: `${next[2]}px`, height: `${next[3]}px` }, reduced.matches || first ? { duration: 0 } : ease);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(position); }
  function peek() {
    syncIdentity();
    const focus = keyboardFocus && nav!.contains(document.activeElement) && !document.activeElement?.closest('.nav-collapse');
    const open = !mobile.matches && document.body.classList.contains('nav-collapsed') && (hovering || focus);
    nav!.classList.toggle('ax-nav-peek', open);
    identity.setAttribute('aria-hidden', String(mobile.matches || (document.body.classList.contains('nav-collapsed') && !open)));
    schedule();
  }
  nav.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hovering = true; keyboardFocus = false; peek(); } });
  nav.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hovering = false; keyboardFocus = false; peek(); } });
  nav.addEventListener('click', e => {
    if (mobile.matches || !(e.target instanceof Element) || !e.target.closest('.nav-item')) return;
    const wasCollapsed = document.body.classList.contains('nav-collapsed');
    // Module selection does not change the hover state. Leaving the sidebar closes it.
    // A microtask can run between native capture and the inline goTo handler.
    // The next animation frame runs after the entire click dispatch, before painting.
    requestAnimationFrame(() => {
      // goTo() restores the old width when leaving Services' automatic collapsed mode.
      // Preserve the collapsed menu the user just selected from, without changing their saved preference.
      if (wasCollapsed && !mobile.matches && !document.body.classList.contains('nav-collapsed')) {
        const app = window as Window & { setSidenavCollapsed?: (value: boolean, options: {persist: boolean}) => void };
        app.setSidenavCollapsed?.(true, {persist: false});
      }
      peek();
    });
  }, true);
  // A pointer click legitimately leaves focus on a link; it must not pin the hover menu.
  // Track input intent instead of blurring the link (which would break keyboard continuity).
  document.addEventListener('pointerdown', () => { keyboardFocus = false; peek(); }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab' || (e.target instanceof Node && nav.contains(e.target))) {
      keyboardFocus = true;
      requestAnimationFrame(peek);
    }
  }, true);
  nav.addEventListener('focusin', peek);
  nav.addEventListener('focusout', () => requestAnimationFrame(peek));
  nav.addEventListener('scroll', schedule, { passive: true });
  new ResizeObserver(schedule).observe(nav);
  new MutationObserver(records => {
    if (records.some(r => r.target !== pill && !(r.target instanceof Element && r.target.closest('.ax-motion-nav-pill')))) { syncIdentity(); schedule(); }
  }).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  new MutationObserver(peek).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  mobile.addEventListener('change', peek);
  reduced.addEventListener('change', () => { pillMotion?.stop(); key = ''; schedule(); });
  window.addEventListener('resize', schedule, { passive: true });
  document.fonts.ready.then(schedule);
  window.addEventListener('auxilios:profile-ready', peek);
  peek();
  position();
}

function notifications(box: HTMLElement) {
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'ax-motion-toast-toggle';
  box.id ||= 'ax-motion-notifications';
  toggle.setAttribute('aria-controls', box.id);
  box.before(toggle); box.classList.add('ax-motion-stack');
  let pinned = false, hovering = false, frame = 0;
  const observed = new WeakSet<HTMLElement>();
  const positions = new WeakMap<HTMLElement, string>();
  const motions = new WeakMap<HTMLElement, ReturnType<typeof animate>>();
  const resize = new ResizeObserver(schedule);
  function schedule() { if (!frame) frame = requestAnimationFrame(layout); }
  function layout() {
    frame = 0;
    const items = Array.from(box.querySelectorAll<HTMLElement>(':scope > .ax-toast'));
    const focused = box.contains(document.activeElement);
    // Urgent messages are never buried behind a success message.
    const urgent = items.some(item => item.classList.contains('ax-toast-danger'));
    const expanded = pinned || hovering || focused || urgent;
    toggle.hidden = items.length < 2;
    toggle.textContent = `${expanded ? 'Contraer' : 'Ver'} ${items.length} avisos`;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.disabled = urgent;
    toggle.title = urgent ? 'Los errores permanecen visibles hasta cerrarlos' : 'Expandir o contraer notificaciones';
    let offset = 0;
    items.forEach((item, i) => {
      if (!observed.has(item)) { observed.add(item); resize.observe(item); }
      const closing = item.hasAttribute('data-closing');
      const y = expanded ? -offset : -i * 13;
      const scale = expanded ? 1 : 1 - i * .045;
      const opacity = closing ? 0 : expanded ? 1 : 1 - i * .13;
      const transform = `translate(${closing ? 32 : 0}px, ${y}px) scale(${scale})`;
      item.style.zIndex = String(items.length - i);
      item.inert = !expanded && i > 0;
      item.dispatchEvent(new CustomEvent('ax:toast-pause', { detail: expanded || i > 0 }));
      const key = `${transform}|${opacity}`;
      if (positions.get(item) !== key) {
        const first = !positions.has(item);
        positions.set(item, key); motions.get(item)?.stop();
        motions.set(item, animate(item, {
          transform: first ? ['translate(0px, 24px) scale(.94)', transform] : transform,
          opacity: first ? [0, opacity] : opacity
        }, reduced.matches ? { duration: 0 } : closing ? { duration: .16 } : ease));
      }
      offset += item.offsetHeight + 10;
    });
    const height = !items.length ? 0 : expanded ? offset - 10 : items[0].offsetHeight + (items.length - 1) * 13;
    box.style.height = `${height}px`;
    toggle.style.setProperty('--ax-stack-height', `${height}px`);
  }
  toggle.addEventListener('click', () => { pinned = !pinned; schedule(); });
  box.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hovering = true; schedule(); } });
  box.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hovering = false; schedule(); } });
  box.addEventListener('focusin', schedule);
  box.addEventListener('focusout', schedule);
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !urgentVisible()) { pinned = false; hovering = false; toggle.focus(); schedule(); }
  });
  function urgentVisible() { return !!box.querySelector('.ax-toast-danger'); }
  new MutationObserver(records => {
    for (const record of records) record.removedNodes.forEach(node => {
      if (node instanceof HTMLElement) { resize.unobserve(node); motions.get(node)?.cancel(); }
    });
    schedule();
  }).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-closing'] });
  reduced.addEventListener('change', () => { itemsReset(); schedule(); });
  function itemsReset() { box.querySelectorAll<HTMLElement>('.ax-toast').forEach(item => positions.delete(item)); }
  layout();
}

function tabs(box: HTMLElement) {
  const ink = document.createElement('i');
  ink.className = 'ax-motion-tab-ink'; ink.setAttribute('aria-hidden', 'true');
  box.append(ink); box.classList.add('ax-motion-tabs');
  let key = '', frame = 0, control: ReturnType<typeof animate> | undefined;
  function update() {
    frame = 0;
    const selected = box.querySelector<HTMLElement>('button.active');
    if (!selected || !visible(box)) { ink.hidden = true; return; }
    const a = selected.getBoundingClientRect(), b = box.getBoundingClientRect();
    const x = a.left - b.left + box.scrollLeft;
    const next = `${x}|${a.width}|${a.height}`;
    ink.hidden = false;
    if (key === next) return;
    const first = !key; key = next; control?.stop();
    control = animate(ink, { left: `${x}px`, width: `${a.width}px`, height: `${a.height}px`, top: `${a.top - b.top}px` }, reduced.matches || first ? { duration: 0 } : ease);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  new MutationObserver(() => { if (!box.contains(ink)) box.append(ink); schedule(); })
    .observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  new ResizeObserver(schedule).observe(box);
  reduced.addEventListener('change', () => { control?.stop(); key = ''; schedule(); });
  box.addEventListener('scroll', schedule, { passive: true });
  update();
}

function themeReveal() {
  // Keep the original Dark / Light / System preference, per-user storage and existing palette.
  const root = document.documentElement;
  let before: string | null = null, origin: DOMRect | null = null;
  type Transition = { ready: Promise<void>; finished: Promise<void>; skipTransition(): void };
  const doc = document as Document & { startViewTransition?: (callback: () => void) => Transition };
  let transition: Transition | null = null;
  reduced.addEventListener('change', () => { if (reduced.matches) transition?.skipTransition(); });
  document.addEventListener('click', e => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-theme-pick], .ax-theme-seg button')) return;
    before = root.getAttribute('data-theme');
    origin = document.getElementById('tb-theme')?.getBoundingClientRect() || e.target.getBoundingClientRect();
  }, true);
  window.addEventListener('auxilios:theme', () => {
    const previous = before; before = null;
    const next = root.getAttribute('data-theme');
    if (!previous || previous === next || reduced.matches || !doc.startViewTransition) return;
    transition?.skipTransition();
    root.setAttribute('data-theme', previous);
    root.classList.add('ax-theme-reveal');
    const current = doc.startViewTransition(() => root.setAttribute('data-theme', next!));
    transition = current;
    void current.ready.then(() => {
      if (transition !== current) return;
      const x = origin ? origin.left + origin.width / 2 : innerWidth - 40;
      const y = origin ? origin.top + origin.height / 2 : 30;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, {
        duration: 450, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)'
      });
    }).catch(() => { if (transition === current) root.setAttribute('data-theme', next!); });
    void current.finished.catch(() => {}).finally(() => {
      if (transition === current) { transition = null; root.classList.remove('ax-theme-reveal'); }
    });
  });
}

function install() {
  if (document.body.classList.contains('ax-motion')) return;
  document.body.classList.add('ax-motion');
  navigation(); themeReveal();
  const initialized = new WeakSet<HTMLElement>();
  const shown = new WeakMap<HTMLElement, boolean>();
  const states = new WeakMap<HTMLElement, string>();
  const selector = '.screen, .ax-backdrop, .modal-backdrop, .psv-backdrop, .ax-stateful, .ax-toasts, .ax-theme-menu, .os-status-tabs, .os-commandbar, .rsm-kpi, .rsm-card, #dash-view-analitica, .dashx-body';
  const pending = new Set<HTMLElement>(); let frame = 0;
  function inspect(el: HTMLElement) {
    if (!el.isConnected) return;
    if (el.matches('.os-commandbar')) {
      if (!initialized.has(el) && el.querySelector('#os-q')) { initialized.add(el); enhanceServiceToolbar(el); }
      return;
    }
    if (el.matches('.ax-toasts, .os-status-tabs')) {
      if (!initialized.has(el)) { initialized.add(el); if (el.matches('.ax-toasts')) notifications(el); else tabs(el); }
      return;
    }
    if (el.matches('.ax-stateful')) {
      const state = el.dataset.state || '';
      if (states.get(el) !== state) {
        states.set(el, state);
        const label = el.querySelector<HTMLElement>('.ax-state-label');
        if (label) enter(label, 'translateY(7px)');
      }
      return;
    }
    const open = visible(el) && !el.hasAttribute('data-closing');
    const was = shown.get(el); shown.set(el, open);
    if (!open || was) return;
    if (el.matches('.screen, #dash-view-analitica, .dashx-body')) {
      const cards = el.querySelectorAll<HTMLElement>('.dashx-kpi, .dashx-card, .dashx-metric, .rsm-kpi, .rsm-card, .os-commandbar, .os-status-tabs');
      Array.from(cards).filter(visible).slice(0, 12).forEach((card, i) => enter(card, 'translateY(16px)', i * .035));
    } else {
      const panel = el.querySelector<HTMLElement>('.ax-modal, .modal-box, .psv-dialog') || el;
      panel.classList.add('ax-motion-panel');
      enter(panel, mobile.matches ? 'translateY(30px)' : 'translateY(20px) scale(.96)');
    }
  }
  function queue(el: HTMLElement) {
    pending.add(el);
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; pending.forEach(inspect); pending.clear(); });
  }
  function scan(el: HTMLElement) {
    if (el.matches(selector)) queue(el);
    el.querySelectorAll<HTMLElement>(selector).forEach(queue);
  }
  new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'childList') {
        record.addedNodes.forEach(node => { if (node instanceof HTMLElement) scan(node); });
        // Button labels are replaced by AxUI.busy, but the button itself survives.
        if (record.target instanceof HTMLElement && record.target.matches('.ax-stateful')) queue(record.target);
      } else if (record.target instanceof HTMLElement && record.target.matches(selector)) queue(record.target);
    });
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-state', 'data-anim', 'data-closing', 'style'] });
  scan(document.body);
  // Existing theme trigger is a div: add keyboard parity without replacing its handler.
  document.getElementById('tb-theme')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
