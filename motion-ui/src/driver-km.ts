import { createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motion, MotionConfig, LayoutGroup, AnimatePresence, useReducedMotion } from 'motion/react';
import { animate } from 'motion/mini';

type Totals = { km: number | null; services: number; closed: number; average: number | null; missing: number };
type Model = { uid: string; days: number; metric: string; range: string; totals: Totals; points: { date: string; label: string; value: number | null }[]; message?: string };
type App = Window & { AuxiliosKmMotion?: { present: (panel: HTMLElement, model: Model, expanded: boolean) => void }; AuxiliosDriverKm?: { renderVisual?: () => void } };
const number = (value: number | null) => value == null ? '—' : value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const roots = new WeakMap<HTMLElement, Root>();

function Segment({ kind, value, choices }: { kind: string; value: string; choices: [string, string][] }) {
  const reduced = useReducedMotion();
  return h('div', { className: 'dkm-segment dkm-react-segment', 'aria-label': kind === 'days' ? 'Período' : 'Métrica' },
    choices.map(([key, label]) => h('button', { key, type: 'button', ['data-' + kind]: key, 'aria-pressed': value === key },
      value === key ? h(motion.span, { className: 'dkm-motion-ink', layoutId: 'km-' + kind, transition: { type: 'spring', duration: reduced ? 0 : .38, bounce: .12 }, 'aria-hidden': true }) : null,
      h('span', { className: 'dkm-motion-label' }, label))));
}

function Activity({ model, expanded }: { model: Model; expanded: boolean }) {
  const reduced = useReducedMotion();
  const [selection, select] = useState<{ date: string; metric: string } | null>(null);
  const point = selection?.metric === model.metric ? model.points.find(p => p.date === selection.date) : null;
  const unit = model.metric === 'km' ? ' km' : ' servicios';
  const maximum = Math.max(1, ...model.points.map(p => p.value || 0));
  const totals: [string, number | null, string][] = [
    ['Kilómetros recorridos', model.totals.km, 'km'], ['Servicios realizados', model.totals.services, ''],
    ['Jornadas cerradas', model.totals.closed, ''], ['Promedio por jornada', model.totals.average, 'km'],
  ];
  return h(motion.div, {
    className: 'dkm-react-shell', initial: false, animate: { height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 },
    transition: { duration: reduced ? 0 : .36, ease: [.22, 1, .36, 1] }, inert: !expanded, 'aria-hidden': !expanded,
    onAnimationComplete: () => { window.dispatchEvent(new Event('auxilios:km-motion-settled')); },
  }, h('div', { className: 'dkm-react-content' }, model.message ? h('p', { className: 'dkm-note' }, model.message) :
    h(LayoutGroup, { id: 'driver-km-activity' },
      h('div', { className: 'dkm-stat-head' }, h('h3', null, 'Tu actividad'), h(Segment, { kind: 'days', value: String(model.days), choices: [['7', '7 días'], ['30', '30 días']] })),
      h('p', { className: 'dkm-note' }, 'En todos tus camiones · ' + model.range),
      h('dl', { className: 'dkm-totals' }, totals.map(([label, value, suffix]) => h('div', { key: label }, h('dt', null, label), h('dd', null, number(value), suffix ? h('small', null, ' ' + suffix) : null)))),
      model.totals.missing ? h('p', { className: 'dkm-note' }, model.totals.missing + ' jornada(s) sin odómetros válidos; no suman kilómetros ni promedio.') : null,
      h('div', { className: 'dkm-chart-head' }, h('h4', null, 'Actividad por día'), h(Segment, { kind: 'metric', value: model.metric, choices: [['km', 'Km'], ['services', 'Servicios']] })),
      h('div', { className: 'dkm-chart', style: { gridTemplateColumns: 'repeat(' + model.points.length + ',minmax(26px,1fr))' }, 'aria-label': (model.metric === 'km' ? 'Kilómetros de jornadas cerradas' : 'Servicios firmados') + ' por día' },
        model.points.map(p => h('button', {
          key: p.date, type: 'button', className: 'dkm-day', 'data-date': p.date, 'aria-label': p.label + ': ' + number(p.value) + unit, 'aria-pressed': point?.date === p.date,
          onClick: (event) => { event.stopPropagation(); select({ date: p.date, metric: model.metric }); },
        }, h('span', { className: 'dkm-bar-track' }, h(motion.i, { initial: { height: 0 }, animate: { height: (p.value || 0) / maximum * 100 + '%' }, transition: { duration: reduced ? 0 : .4, ease: [.22, 1, .36, 1] } })), h('small', null, Number(p.date.slice(-2)))))),
      h('p', { className: 'dkm-chart-value', id: 'dkm-chart-value', role: 'status' }, point ? point.label + ': ' + number(point.value) + unit : 'Tocá un día para ver el detalle. Deslizá el gráfico para ver más días.'),
      h('p', { className: 'dkm-note' }, 'Km según fecha de jornada cerrada. Servicios según fecha de firma; sin pendientes ni anulados.'))));
}

function ScanStatus({ phase }: { phase: string }) {
  const reduced = useReducedMotion();
  if (phase === 'photo') return null;
  const labels: Record<string, string> = { photo: 'Foto del odómetro', processing: 'Leyendo el tablero…', result: 'Lectura disponible · revisá los datos', manual: 'Revisá el odómetro manualmente', offline: 'Sin conexión · completá el odómetro a mano' };
  return h(MotionConfig, { reducedMotion: 'user' }, h('div', { className: 'dkm-scan-state', role: 'status', 'data-scan-phase': phase },
    h(AnimatePresence, { mode: 'wait', initial: false }, h(motion.span, { key: phase, initial: { opacity: 0, y: reduced ? 0 : 5 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: reduced ? 0 : -5 }, transition: { duration: reduced ? 0 : .16 } },
      h(motion.i, { className: 'dkm-scan-dot', 'aria-hidden': true, animate: { opacity: phase === 'processing' && !reduced ? [.4, 1, .4] : 1 }, transition: { duration: 1.1, repeat: phase === 'processing' && !reduced ? Infinity : 0 } }), labels[phase]))));
}

export function enhanceDriverKm() {
  const app = window as App;
  app.AuxiliosKmMotion = { present(panel, model, expanded) {
    let root = roots.get(panel);
    if (!root) { panel.replaceChildren(); panel.classList.add('dkm-react-panel'); root = createRoot(panel); roots.set(panel, root); }
    panel.hidden = false;
    root.render(h(MotionConfig, { reducedMotion: 'user' }, h(Activity, { key: model.uid, model, expanded })));
  } };
  app.AuxiliosDriverKm?.renderVisual?.();

  for (const pre of ['nj', 'cj']) {
    const modal = document.getElementById(pre === 'nj' ? 'modal-nueva-jornada' : 'modal-cerrar-jornada');
    const group = modal?.querySelector<HTMLElement>('.dkm-odometer');
    if (!modal || !group) continue;
    const host = document.createElement('div'); host.className = 'dkm-scan-react'; group.prepend(host);
    const root = createRoot(host);
    let last = '', frame = 0;
    const running = new Map<HTMLElement, ReturnType<typeof animate>>();
    const visible = new WeakMap<HTMLElement, boolean>();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      frame = 0;
      const text = document.getElementById(pre + '-foto-status')?.textContent || '';
      const result = document.getElementById(pre + '-km-result');
      const manual = document.getElementById(pre + '-km-manual-area');
      const shown = (el: HTMLElement | null) => !!el && !el.hidden && el.style.display !== 'none';
      const phase = !modal.classList.contains('open') ? 'photo' : /procesando/i.test(text) ? 'processing' : /teléfono/i.test(text) ? 'offline' : /no se pudo/i.test(text) ? 'manual' : shown(result) ? 'result' : shown(manual) ? 'manual' : 'photo';
      if (last !== phase) { last = phase; root.render(h(ScanStatus, { phase })); }
      for (const el of [result, manual]) {
        if (!el) continue;
        const on = modal.classList.contains('open') && shown(el), before = visible.get(el);
        visible.set(el, on);
        if (!on) { running.get(el)?.cancel(); running.delete(el); }
        if (!on || before || reduce.matches) continue;
        running.get(el)?.cancel();
        const control = animate(el, { opacity: [.3, 1], transform: ['translateY(7px)', 'none'] }, { duration: .22 });
        running.set(el, control);
        void control.then(() => { if (running.get(el) === control) { control.cancel(); running.delete(el); } });
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    // Observe only legacy nodes, never React's subtree (avoids observer/render loops).
    for (const id of ['foto-status', 'km-result', 'km-manual-area']) {
      const el = document.getElementById(pre + '-' + id);
      if (el) new MutationObserver(schedule).observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'hidden'] });
    }
    new MutationObserver(schedule).observe(modal, { attributes: true, attributeFilter: ['class'] });
    reduce.addEventListener('change', () => { running.forEach(control => control.cancel()); running.clear(); schedule(); });
    sync();
  }
}
