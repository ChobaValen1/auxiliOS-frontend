/* Presentación compartida de acciones de registros. No modifica handlers ni permisos. */
(function (global) {
  'use strict';
  var doc = global.document;
  var menuSelector = '[role="menu"], [role="menuitem"], .os-row-menu, #os-row-menu, .empv2-actions-menu, .ct4-menu, .oi-menu, .obx-menu, [class$="-actions-menu"]';
  var recordSelector = 'tbody, [role="row"], [data-record-actions], .ftd-planes, .ftd-docs, .empv2-section-card, [class*="-row-actions"], [class*="-card-actions"], [class*="-item-actions"], [class*="-actions"], [class*="-card"], [class*="-fila"], .cfg-row, .rgt';
  var rules = [
    [/^(editar|modificar|corregir)\b/, 'pencil'], [/^(eliminar|borrar|quitar|anular)\b/, 'trash-2'],
    [/^(restaurar|reactivar|reabrir)\b/, 'rotate-ccw'], [/^(ver|visualizar|detalle|abrir detalle)\b/, 'eye'],
    [/^(descargar|pdf|exportar)\b/, 'download'], [/^(subir|cargar|adjuntar)\b/, 'upload'],
    [/^(actualizar|reemplazar|renovar)\b/, 'refresh-cw'], [/^(copiar|duplicar)\b/, 'copy'],
    [/^(desactivar|deshabilitar|bloquear)\b/, 'ban'], [/^(activar|habilitar|aprobar|validar|confirmar)\b/, 'circle-check'],
    [/^(rechazar|observar)\b/, 'circle-alert'], [/^(historial|auditoria)\b/, 'history'],
    [/^(enviar|compartir|whatsapp)\b/, 'share-2'], [/^(asignar|reasignar)\b/, 'users'],
    [/^(cobrar|pagar|registrar pago)\b/, 'hand-coins'], [/^(facturar|factura)\b/, 'receipt'],
    [/^(iniciar|continuar)\b/, 'play'], [/^(finalizar|cerrar|completar|marcar revisado|visto)\b/, 'check'],
    [/^(dar de baja)\b/, 'ban'], [/^(revertir|volver a pendiente)\b/, 'rotate-ccw'],
    [/^(revisar)\b/, 'clipboard-check'], [/^(programar|vigencia)\b/, 'calendar'],
    [/^(generar enlace)\b/, 'share-2'], [/^(registrar cobro|marcar pagada)\b/, 'hand-coins'],
    [/^(imprimir|emitir nota de credito)\b/, 'file-text'], [/^(cambiar|configurar)\b/, 'settings'],
    [/^(ir al servicio)\b/, 'external-link'], [/^(reintentar)\b/, 'refresh-cw']
  ];
  function normalize(text) { return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^[^a-zA-Z]+/, '').trim().toLowerCase(); }
  function iconFor(text) {
    var label = normalize(text);
    if (/^(crear|nuevo|nueva|guardar|cancelar|aceptar|buscar|filtrar)\b/.test(label) || /^volver$/.test(label) || /en lote|masiv|seleccionad|todos|todo el/.test(label)) return null;
    var rule = rules.find(function (r) { return r[0].test(label); });
    return rule ? rule[1] : null;
  }
  function enhance(b) {
    if (!b || !b.matches || !b.matches('button, a[role="button"], a[download]')) return;
    if (b.querySelector('.aux-record-label') || b.hasAttribute('data-keep-action-text') || b.matches('[role="tab"], [aria-haspopup], [type="submit"]')) return;
    if (b.closest('form, .modal-footer, .ax-modal-foot, footer, .sidenav, .bottom-nav, [role="tablist"], .ftd-fuel-filter, .ftd-fuel-pages')) return;
    var menu = !!b.closest(menuSelector);
    if (!menu && !b.closest(recordSelector)) return;
    var text = b.textContent.trim(), label = b.getAttribute('aria-label') || b.getAttribute('title') || text;
    if (text === '🗑') label = b.getAttribute('aria-label') || b.getAttribute('title') || 'Eliminar';
    if (text === '👁') label = b.getAttribute('aria-label') || b.getAttribute('title') || 'Ver detalle';
    var name = iconFor(normalize(text) ? text : label);
    if (!name) return;
    var hasIcon = !!b.querySelector('svg');
    if (!text && hasIcon) {
      b.classList.add('aux-record-action');
      if (!b.getAttribute('title')) b.setAttribute('title', label);
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', label);
      return;
    }
    b.setAttribute('title', b.getAttribute('title') || label);
    b.setAttribute('aria-label', label);
    var span = doc.createElement('span'); span.className = 'aux-record-label';
    // Conservar los nodos existentes: algunos módulos enlazan eventos a sus hijos.
    while (b.firstChild) span.appendChild(b.firstChild);
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ax-icon'); svg.setAttribute('aria-hidden', 'true');
    var use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/ui/icons.svg#' + name); svg.appendChild(use);
    b.appendChild(svg); b.appendChild(span);
    b.classList.add(menu ? 'aux-record-menu-action' : 'aux-record-action');
    if (/^(eliminar|borrar|quitar|anular|desactivar|deshabilitar)\b/.test(normalize(label))) b.classList.add('aux-record-danger');
  }
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    enhance(root);
    root.querySelectorAll('button, a[role="button"], a[download]').forEach(enhance);
  }
  global.AuxiliosRecordActions = { scan: scan, iconFor: iconFor };
  function start() {
    scan(doc.body);
    var pending = new Set(), scheduled = false;
    var observer = new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.target.closest && r.target.closest('.aux-record-label')) return;
        if (r.target.matches && r.target.matches('.aux-record-action, .aux-record-menu-action') && r.target.querySelector('.aux-record-label')) return;
        if (r.type === 'childList') r.addedNodes.forEach(function (n) { if (n.nodeType === 1) pending.add(n); else if (r.target.nodeType === 1) pending.add(r.target); });
      });
      if (!pending.size || scheduled) return;
      scheduled = true;
      global.requestAnimationFrame(function () { scheduled = false; pending.forEach(function (n) { if (n.isConnected) scan(n); }); pending.clear(); });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})(window);
