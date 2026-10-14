/* AuxiliOS · Documentos del camión · leer el vencimiento desde la foto (v1)

   En "Subir documento (Camión)", al elegir la foto o el PDF se lee el documento
   (función leer-documento-camion) y se completan el vencimiento, el número y el
   período si están vacíos. Avisa si la patente leída no es la del móvil elegido,
   si el documento parece de otro tipo o si ya está vencido. No guarda nada: el
   usuario revisa y guarda como siempre. */
(function (global) {
  'use strict';

  var MAX_PDF = 8 * 1024 * 1024;
  var lectura = 0;

  function el(id) { return document.getElementById(id); }
  function hoy() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fecha(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function nombreTipo(code) {
    var meta = typeof DOC_CAMION_META !== 'undefined' ? DOC_CAMION_META : {};
    return (meta[code] && meta[code].name) || code;
  }
  function patenteDe(truckId) {
    var lista = [];
    try { lista = lista.concat(_listaCamiones || []); } catch (e) { /* sin lista */ }
    try { lista = lista.concat(_flotaAdmin || []); } catch (e) { /* sin flota */ }
    var t = lista.find(function (x) { return String(x.truck_id) === String(truckId); });
    return t && t.plate ? String(t.plate).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  }

  function estado(msg, tono) {
    var box = el('utd-scan-status');
    if (!box) {
      var ref = el('utd-file-box');
      var wrap = ref && ref.closest ? ref.closest('.file-upload-wrapper') : null;
      if (!wrap || !wrap.parentNode) return;
      box = document.createElement('div');
      box.id = 'utd-scan-status';
      box.className = 'tdr-status';
      box.setAttribute('role', 'status');
      wrap.parentNode.insertBefore(box, wrap.nextSibling);
    }
    box.hidden = !msg;
    box.className = 'tdr-status' + (tono ? ' tdr-' + tono : '');
    box.innerHTML = msg || '';
  }

  /* Aplica lo leído al formulario (sólo campos vacíos) y arma los avisos. */
  function aplicar(d, ctx) {
    var hechos = [], avisos = [];
    var set = function (id, v) {
      var i = el(id);
      if (!i || v == null || v === '') return false;
      if (String(i.value || '').trim()) return false;
      i.value = v;
      i.dispatchEvent && i.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    var vencVisible = !el('utd-venc-group') || el('utd-venc-group').style.display !== 'none';
    var perVisible = el('utd-periodo-group') && el('utd-periodo-group').style.display !== 'none';
    if (d.vencimiento && vencVisible && set('utd-vencimiento', d.vencimiento)) hechos.push('vencimiento ' + fecha(d.vencimiento));
    if (d.periodo && perVisible && set('utd-periodo', d.periodo)) hechos.push('período ' + d.periodo);
    if (d.numero && set('utd-nro', d.numero)) hechos.push('número ' + d.numero);

    if (d.vencimiento && d.vencimiento < (ctx.hoy || hoy())) avisos.push('El documento leído está vencido (' + fecha(d.vencimiento) + ').');
    if (d.patente && ctx.patente && d.patente !== ctx.patente) avisos.push('La patente del documento (' + d.patente + ') no es la del móvil elegido (' + ctx.patente + ').');
    if (d.tipo && ctx.tipo && d.tipo !== ctx.tipo) avisos.push('Parece un/a ' + nombreTipo(d.tipo) + ', no un/a ' + nombreTipo(ctx.tipo) + '.');
    if (d.vencimiento && !vencVisible) avisos.push('Se leyó un vencimiento (' + fecha(d.vencimiento) + ') pero este tipo de documento no lo pide.');
    return { hechos: hechos, avisos: avisos };
  }

  function comprimir(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var MAX = 2000, s = Math.min(1, MAX / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function base64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(String(e.target.result).split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function leer(file) {
    var id = ++lectura;
    var esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!esPdf && !/^image\//.test(file.type || '')) return estado('');
    if (esPdf && file.size > MAX_PDF) return estado('El PDF es muy grande para leerlo solo. Completá los datos a mano.', 'aviso');
    estado('Leyendo el documento…', 'info');
    try {
      var contenido = esPdf ? await base64(file) : await comprimir(file);
      var token = await obtenerAccessToken();
      var res = await fetch(SUPABASE_URL + '/functions/v1/leer-documento-camion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY },
        body: JSON.stringify({ archivo_base64: contenido, mime: esPdf ? 'application/pdf' : 'image/jpeg', tipo: (el('utd-tipo') || {}).value || '' })
      });
      var d = await res.json().catch(function () { return {}; });
      if (id !== lectura) return;
      if (!res.ok || !d.success) return estado('No se pudo leer el documento. Completá los datos a mano.', 'aviso');
      var r = aplicar(d, { tipo: (el('utd-tipo') || {}).value || '', patente: patenteDe((el('utd-truck-id') || {}).value), hoy: hoy() });
      var msg = r.hechos.length ? 'Se completó: ' + r.hechos.join(', ') + '. Revisá antes de guardar.' : 'Se leyó el documento, pero no había campos vacíos para completar.';
      estado(msg + r.avisos.map(function (a) { return '<br><b>⚠ ' + a.replace(/</g, '&lt;') + '</b>'; }).join(''), r.avisos.length ? 'aviso' : 'ok');
    } catch (e) {
      if (id === lectura) estado('No se pudo leer el documento. Completá los datos a mano.', 'aviso');
    }
  }

  function envolver(nombre, fn) {
    var orig = global[nombre];
    if (typeof orig !== 'function' || orig.__tdr) return typeof orig === 'function';
    var w = fn(orig); w.__tdr = true; global[nombre] = w;
    return true;
  }
  function enganchar() {
    var a = envolver('utdOnFileChange', function (orig) {
      return function () {
        var r = orig.apply(this, arguments);
        var f = el('utd-file') && el('utd-file').files && el('utd-file').files[0];
        if (f) leer(f);
        return r;
      };
    });
    var b = envolver('abrirUploadTruckDoc', function (orig) {
      return function () { lectura++; estado(''); return orig.apply(this, arguments); };
    });
    return a && b;
  }
  if (!enganchar()) {
    var n = 0, tm = setInterval(function () { if (enganchar() || ++n > 40) clearInterval(tm); }, 250);
  }

  global.AuxiliosLectorDocCamion = { leer: leer, _test: { aplicar: aplicar } };
})(window);
