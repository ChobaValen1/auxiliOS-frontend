/* AuxiliOS · Desglose de costos de un servicio (v1)

   Una sola forma de mostrar de dónde sale un importe, para Facturación (cotización de hoy)
   y para Facturas (cotización congelada al facturar):

     Concepto · Cantidad × Precio · Subtotal
     + recargos · + peajes que van con el servicio · − copago del cliente
     = Total

   Lo que la cotización no explica se muestra como "Diferencia sin desglosar" en vez de
   esconderse, para que la tabla siempre sume el total que se factura. */
(function (global) {
  'use strict';

  var UNIDADES = { fixed: 'Fijo', fijo: 'Fijo', km: 'Por km', hour: 'Por hora', hora: 'Por hora', unit: 'Por unidad', recargo: 'Recargo', peajes: 'Peajes' };
  var RECARGOS = { holiday: 'Recargo por feriado', night: 'Recargo nocturno', weekend: 'Recargo de fin de semana', waiting: 'Recargo por espera' };

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v, cur) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur || 'ARS', maximumFractionDigits: 2 }).format(num(v));
  }
  function cantidad(v) { return num(v).toLocaleString('es-AR', { maximumFractionDigits: 2 }); }

  /* → { filas: [{tipo, etiqueta, detalle, cantidad, unitario, importe}], total, sinDesglosar } */
  function filas(quote, opts) {
    var q = quote || {}, o = opts || {}, out = [];
    (Array.isArray(q.components) ? q.components : []).forEach(function (c) {
      var u = UNIDADES[String(c.pricing_unit || '').toLowerCase()] || c.pricing_unit || '';
      out.push({
        tipo: 'concepto', etiqueta: c.service_name || c.role || 'Concepto',
        detalle: [u, c.price_source].filter(Boolean).join(' · '),
        cantidad: c.quantity == null ? 1 : num(c.quantity), unitario: num(c.unit_price), importe: num(c.subtotal)
      });
    });
    var recargos = Array.isArray(q.surcharges) ? q.surcharges : [];
    if (recargos.length) {
      recargos.forEach(function (s) {
        var pct = s.calculation_mode === 'percentage';
        out.push({
          tipo: 'recargo', etiqueta: RECARGOS[s.rule_type] || 'Recargo',
          detalle: pct ? cantidad(s.configured_value) + ' % sobre ' + money(s.eligible_base, q.currency) : 'Importe fijo',
          cantidad: null, unitario: null, importe: num(s.amount)
        });
      });
    } else if (num(q.surcharge_total) > 0) {
      out.push({ tipo: 'recargo', etiqueta: 'Recargo', detalle: '', cantidad: null, unitario: null, importe: num(q.surcharge_total) });
    }
    var peaje = num(q.toll_total), aparte = q.toll_billing_mode === 'separate';
    if (peaje > 0) {
      out.push({
        tipo: aparte ? 'peaje-aparte' : 'peaje', etiqueta: 'Peajes',
        detalle: aparte ? 'Se facturan por separado (pestaña Peajes)' : 'Incluidos en el servicio',
        cantidad: null, unitario: null, importe: peaje
      });
    }
    var copago = num(q.copay_total);
    if (copago > 0) out.push({ tipo: 'copago', etiqueta: 'Copago a cargo del cliente', detalle: 'No se factura a la prestadora', cantidad: null, unitario: null, importe: -copago });

    var total = o.total != null ? num(o.total) : num(q.current_company_amount != null ? q.current_company_amount : q.company_estimated_total);
    var suma = out.reduce(function (t, f) { return f.tipo === 'peaje-aparte' ? t : t + f.importe; }, 0);
    var sinDesglosar = r2(total - suma);
    if (Math.abs(sinDesglosar) > 0.009) {
      out.push({ tipo: 'ajuste', etiqueta: 'Diferencia sin desglosar', detalle: 'La cotización no detalla este importe', cantidad: null, unitario: null, importe: sinDesglosar });
    }
    return { filas: out, total: r2(total), sinDesglosar: Math.abs(sinDesglosar) > 0.009 ? sinDesglosar : 0 };
  }

  function tabla(quote, opts) {
    var o = opts || {}, cur = o.currency || (quote && quote.currency) || 'ARS', d = filas(quote, o);
    if (!d.filas.length) return '<div class="bd-empty">Sin conceptos para desglosar.</div>';
    var cuerpo = d.filas.map(function (f) {
      var cuenta = f.cantidad == null ? '' : cantidad(f.cantidad) + ' × ' + money(f.unitario, cur);
      return '<tr class="bd-' + f.tipo + '"><td class="bd-what"><b>' + esc(f.etiqueta) + '</b>' + (f.detalle ? '<small>' + esc(f.detalle) + '</small>' : '') + '</td>'
        + '<td class="bd-calc">' + esc(cuenta) + '</td><td class="bd-amount">' + (f.tipo === 'peaje-aparte' ? '<s>' : '') + esc(money(f.importe, cur)) + (f.tipo === 'peaje-aparte' ? '</s>' : '') + '</td></tr>';
    }).join('');
    return '<div class="bd-wrap"><table class="bd-table"><thead><tr><th>Concepto</th><th>Cálculo</th><th>Importe</th></tr></thead><tbody>' + cuerpo + '</tbody>'
      + '<tfoot><tr><td colspan="2">' + esc(o.totalLabel || 'Total a facturar') + '</td><td class="bd-amount">' + esc(money(d.total, cur)) + '</td></tr></tfoot></table></div>';
  }

  /* Km del recorrido: asfalto y ripio, lo que cubre el radio y lo que queda facturable. */
  function kilometros(quote, servicio) {
    var q = quote || {}, s = servicio || {};
    var asfalto = num(q.asphalt_km != null ? q.asphalt_km : s.estimated_asphalt_km);
    var ripio = num(q.gravel_km != null ? q.gravel_km : s.estimated_gravel_km);
    var total = num(q.distance_km != null ? q.distance_km : s.estimated_distance_km) || asfalto + ripio;
    return {
      total: total, asfalto: asfalto, ripio: ripio,
      radio: q.covered_radius_km == null ? null : num(q.covered_radius_km),
      facturable: q.billable_distance_km == null ? null : num(q.billable_distance_km)
    };
  }

  global.AuxiliosBillingBreakdown = { filas: filas, tabla: tabla, kilometros: kilometros, money: money, esc: esc };
  if (typeof module !== 'undefined') module.exports = global.AuxiliosBillingBreakdown;
})(typeof window !== 'undefined' ? window : globalThis);
