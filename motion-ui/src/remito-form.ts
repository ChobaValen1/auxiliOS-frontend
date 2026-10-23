import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, MotionConfig } from 'motion/react';
import { animate } from 'motion/mini';

// React owns only the progress indicator. Existing fields, validation and signature
// stay mounted and remain owned by the remito workflow.
export function enhanceRemitoForm() {
  const form = document.getElementById('remitos-nuevo');
  const original = document.getElementById('rem-step-dots');
  if (!form || !original || document.getElementById('rmv-motion-progress')) return;
  const host = document.createElement('div');
  host.id = 'rmv-motion-progress';
  original.after(host);
  const root = createRoot(host);
  let previous = '', previousIndex = 0;
  let control: ReturnType<typeof animate> | undefined;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sync = () => {
    if (!form.classList.contains('rmv-flow')) return;
    const panels = Array.from(form.querySelectorAll<HTMLElement>('.rem-step-panel'));
    const dots = Array.from(original.querySelectorAll<HTMLElement>('.rem-step-dot')).filter(el => el.style.display !== 'none');
    const active = panels.find(el => el.classList.contains('active'));
    if (!active || !dots.length) return;
    const index = Math.max(0, dots.findIndex(el => el.classList.contains('active')));
    const labels = dots.length === 5 ? ['Servicio', 'Socio', 'Adicionales', 'Evidencia', 'Firma'] : dots.length === 2 ? ['Adicionales', 'Evidencia'] : ['Socio', 'Adicionales', 'Evidencia', 'Firma'];
    const key = `${active.id}:${dots.length}:${index}`;
    if (key === previous) return;
    original.classList.add('rmv-progress-replaced');
    root.render(h(MotionConfig, { reducedMotion: 'user' }, h('ol', { className: 'rmv-motion-steps', 'aria-label': 'Progreso del remito' }, labels.map((label, i) => h('li', { key: label, 'aria-current': i === index ? 'step' : undefined, className: i < index ? 'is-done' : i === index ? 'is-current' : '' }, h(motion.span, { className: 'rmv-motion-number', animate: { scale: i === index ? 1.08 : 1 }, transition: { type: 'spring', stiffness: 280, damping: 24 } }, i < index ? '✓' : i + 1), h('span', { className: 'rmv-motion-label' }, label), i < labels.length - 1 ? h('span', { className: 'rmv-motion-track', 'aria-hidden': true }, h(motion.i, { initial: false, animate: { scaleX: i < index ? 1 : 0 }, transition: { duration: .35 } })) : null)))));
    control?.cancel();
    if (previous && !reduced.matches && !active.classList.contains('rmv-signature-step')) {
      control = animate(active, { opacity: [.3, 1], transform: [`translateX(${index >= previousIndex ? 14 : -14}px)`, 'none'] }, { duration: .24 });
      const current = control;
      void current.then(() => { if (control === current) current.cancel(); });
    }
    previous = key; previousIndex = index;
  };
  new MutationObserver(sync).observe(form, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  reduced.addEventListener('change', () => control?.cancel());
  sync();
}
