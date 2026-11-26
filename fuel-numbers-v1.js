/* AuxiliOS · Combustible: lectura de números de tickets argentinos.
   Los tickets imprimen «45,320» litros, «$ 1.234,50» por litro y «Total 55.950,00»; la lectura del ticket y el
   chofer pueden traer cualquier mezcla de puntos y comas. Este módulo los convierte sin perder miles ni decimales,
   cruza litros × precio con el total para detectar un separador mal leído y revisa el odómetro contra el camión.
   Se usa en el navegador (window.AuxFuelNumbers) y en los tests de Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuxFuelNumbers = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
  'use strict';

  var LIMITES = {
    litros: [0.5, 2000],
    precio: [50, 50000],
    total: [50, 100000000]
  };

  function limpiar(v) {
    return String(v == null ? '' : v).trim().replace(/[^\d.,-]/g, '').replace(/(?!^)-/g, '');
  }

  /* kind: 'litros' (un punto solo es decimal: «45.320») o 'importe' (un punto con 3 cifras es de miles: «1.850»). */
  function decimal(v, kind) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    var s = limpiar(v);
    if (!s || s === '-') return NaN;
    var neg = s.charAt(0) === '-'; if (neg) s = s.slice(1);
    var comas = (s.match(/,/g) || []).length, puntos = (s.match(/\./g) || []).length;
    var entero, frac = '';
    if (comas && puntos) {
      var dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
      var i = s.lastIndexOf(dec);
      entero = s.slice(0, i).replace(/[.,]/g, ''); frac = s.slice(i + 1).replace(/[.,]/g, '');
    } else if (comas || puntos) {
      var sep = comas ? ',' : '.', partes = s.split(sep), n = partes.length - 1;
      var miles = partes.slice(1).every(function (p) { return p.length === 3; }) && partes[0].length >= 1 && partes[0].length <= 3;
      if (n > 1) {
        if (miles) { entero = partes.join(''); }
        else { frac = partes.pop(); entero = partes.join(''); }
      } else if (sep === '.' && kind === 'importe' && miles) {
        entero = partes.join('');
      } else {
        entero = partes[0]; frac = partes[1];
      }
    } else {
      entero = s;
    }
    if (!/^\d*$/.test(entero) || !/^\d*$/.test(frac) || (entero + frac) === '') return NaN;
    var out = Number((entero || '0') + (frac ? '.' + frac : ''));
    return neg ? -out : out;
  }

  /* Odómetro: siempre un entero. «123.456», «123,456», «123456,7» y «123.456,7 km» son 123456 km.
     Un número que llega como 123.456 (miles leídos como decimales) se corrige a 123456. */
  function km(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || v < 0) return null;
      if (Number.isInteger(v)) return v;
      var fr = (String(v).split('.')[1] || '').length;
      if (fr <= 3 && (v < 1000 || (fr === 3 && v < 10000))) return Math.round(v * 1000);
      return Math.trunc(v);
    }
    var s = limpiar(v).replace(/^-/, '');
    if (!s) return null;
    s = s.replace(/[.,]\d{1,2}$/, '');
    s = s.replace(/[.,]/g, '');
    if (!/^\d+$/.test(s)) return null;
    return Number(s);
  }

  function enRango(campo, n) { var r = LIMITES[campo]; return Number.isFinite(n) && n >= r[0] && n <= r[1]; }
  function redondear(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }
  function variantes(campo, n) {
    if (!Number.isFinite(n) || n <= 0) return [];
    var out = [{ v: n, cambio: 0 }, { v: n * 1000, cambio: 1 }, { v: n / 1000, cambio: 1 }, { v: n * 100, cambio: 1 }, { v: n / 100, cambio: 1 }];
    return out.filter(function (c) { return enRango(campo, c.v); });
  }

  /* Cruza litros × precio con el total. Si un valor quedó ×1000 o ÷1000 por un separador mal leído, lo corrige.
     Devuelve { litros, precio, total, consistente, corregidos: ['litros'|'precio'|'total'] }. */
  function conciliar(d) {
    d = d || {};
    var l = decimal(d.litros, 'litros'), p = decimal(d.precio, 'importe'), t = decimal(d.total, 'importe');
    var out = { litros: Number.isFinite(l) ? l : null, precio: Number.isFinite(p) ? p : null, total: Number.isFinite(t) ? t : null, consistente: null, corregidos: [] };
    if (out.litros != null && out.precio != null && out.total != null) {
      var mejor = null;
      variantes('litros', l).forEach(function (cl) {
        variantes('precio', p).forEach(function (cp) {
          variantes('total', t).forEach(function (ct) {
            var err = Math.abs(cl.v * cp.v - ct.v) / ct.v;
            if (err > 0.02) return;
            var costo = cl.cambio + cp.cambio + ct.cambio;
            if (!mejor || costo < mejor.costo || (costo === mejor.costo && err < mejor.err)) mejor = { l: cl, p: cp, t: ct, costo: costo, err: err };
          });
        });
      });
      if (mejor) {
        if (mejor.l.cambio) out.corregidos.push('litros');
        if (mejor.p.cambio) out.corregidos.push('precio');
        if (mejor.t.cambio) out.corregidos.push('total');
        out.litros = redondear(mejor.l.v, 3); out.precio = redondear(mejor.p.v, 2); out.total = redondear(mejor.t.v, 2);
        out.consistente = true;
      } else {
        out.consistente = false;
      }
      return out;
    }
    if (out.total != null && enRango('total', out.total)) {
      if (out.litros != null && out.precio == null && enRango('litros', out.litros)) { out.precio = redondear(out.total / out.litros, 2); out.corregidos.push('precio'); out.consistente = enRango('precio', out.precio); }
      else if (out.precio != null && out.litros == null && enRango('precio', out.precio)) { out.litros = redondear(out.total / out.precio, 3); out.corregidos.push('litros'); out.consistente = enRango('litros', out.litros); }
    }
    return out;
  }

  /* Revisa el odómetro contra el último registrado del camión. Devuelve { error } o { aviso } o {}. */
  function revisarOdometro(valor, actual) {
    if (valor == null) return {};
    if (!Number.isInteger(valor) || valor <= 0) return { error: 'El odómetro tiene que ser un número entero de km, sin decimales.' };
    if (valor > 3000000) return { error: 'El odómetro parece mal leído (' + miles(valor) + ' km). Revisalo en el tablero.' };
    var ref = Number(actual);
    if (!Number.isFinite(ref) || ref <= 0) return {};
    if (valor < ref) {
      if (valor * 1000 >= ref && valor * 1000 <= ref + 5000) return { aviso: 'El odómetro dice ' + miles(valor) + ' km. ¿Quisiste poner ' + miles(valor * 1000) + ' km? El último registrado es ' + miles(ref) + ' km.', sugerido: valor * 1000 };
      return { aviso: 'El odómetro (' + miles(valor) + ' km) es menor que el último registrado del camión (' + miles(ref) + ' km).' };
    }
    if (valor - ref > 5000) return { aviso: 'El odómetro (' + miles(valor) + ' km) está ' + miles(valor - ref) + ' km por encima del último registrado (' + miles(ref) + ' km).' };
    return {};
  }

  function miles(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  /* Formato argentino para mostrar y para volver a poner en los campos: 1.234,5 */
  function texto(n, decimales, fijo) {
    if (n == null || !Number.isFinite(n)) return '';
    var d = decimales == null ? 2 : decimales, f = redondear(n, d), neg = f < 0, partes = String(Math.abs(f)).split('.');
    var frac = partes[1] || '';
    if (fijo && frac) while (frac.length < d) frac += '0';
    return (neg ? '-' : '') + miles(Number(partes[0])) + (frac ? ',' + frac : '');
  }

  return { decimal: decimal, km: km, conciliar: conciliar, revisarOdometro: revisarOdometro, texto: texto, miles: miles };
});
