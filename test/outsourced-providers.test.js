'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('outsourced-providers-v1.js'), css = read('outsourced-providers-v1.css'), sql = read('migrations/20261018200000_outsourced_providers_v1.sql');
function load() { const window = {}; vm.runInNewContext(src, { window, document: {}, console }); return window.AuxTercerizados; }
const ok = { display_name: 'Grúas Sur', legal_name: 'Grúas Sur SRL', cuit: '30-71234567-1', iva_condition: 'responsable_inscripto', contact_name: 'Marcelo', contact_phone: '11 5555-1234', cbu: '28505909 40090418135201', payment_alias: '', account_holder: '', invoicing_mode: 'monthly', payment_term_days: 15, is_active: true };

test('tercerizados: CUIT y CBU/CVU con dígito verificador, igual que la base', () => {
  const t = load();
  assert.equal(t._validCuit('30-71234567-1'), true);
  assert.equal(t._validCuit('30-71234567-0'), false);
  assert.equal(t._validCuit('3071234567'), false);
  assert.equal(t._validCbu('2850590940090418135201'), true);
  assert.equal(t._validCbu('2850590940090418135202'), false);
  assert.equal(t._validCbu('0000003100012345678901'), true, 'CVU');
  assert.equal(t._validAlias('gruas.sur.mp'), true);
  assert.equal(t._validAlias('abc'), false);
  assert.equal(t._fmtCuit('30712345671'), '30-71234567-1');
  assert.equal(t._fmtCbu('2850590940090418135201'), '28505909 40090418135201');
});

test('tercerizados: obligatorios y pago — basta CBU o alias', () => {
  const t = load();
  assert.deepEqual(Object.keys(t._problems(ok)), []);
  assert.deepEqual(Object.keys(t._problems({ ...ok, cbu: '', payment_alias: 'gruas.sur' })), []);
  const p = t._problems({ ...ok, cbu: '', payment_alias: '', cuit: '30712345', iva_condition: '', contact_phone: '123' });
  assert.deepEqual(Object.keys(p).sort(), ['contact_phone', 'cuit', 'iva_condition', 'pay'].sort());
  assert.match(p.cuit, /Faltan 3 números/);
});

test('tercerizados: la base valida lo mismo, sólo Administración ve y guarda, y queda auditado', () => {
  assert.match(sql, /create table if not exists public\.outsourced_providers/);
  assert.match(sql, /constraint outsourced_providers_payment_check check \(cbu is not null or payment_alias is not null\)/);
  assert.match(sql, /using \(\(select app_private\.current_auxilios_role\(\)\) = 'administracion'\)/);
  assert.match(sql, /if v_role <> 'administracion' then raise exception 'Sólo Administración puede cargar tercerizados'/);
  assert.match(sql, /not app_private\.valid_cuit\(v_cuit\)/);
  assert.match(sql, /not app_private\.valid_cbu\(v_cbu\)/);
  assert.match(sql, /execute function public\.capture_audit_event\('provider_id'\)/);
  assert.match(sql, /Ya hay un tercerizado con ese CUIT/);
});

test('tercerizados: formulario en pasos, faltantes al pie y guardar sólo con cambios', () => {
  assert.match(src, /Identificación<\/h4>[\s\S]*Contacto<\/h4>[\s\S]*Pago<\/h4>/);
  assert.match(src, /'Falta: <b>'/);
  assert.match(src, /save\.disabled = st\.saving \|\| \(editing && !changed\)/);
  assert.match(src, /Tenés cambios sin guardar/);
  assert.match(src, /rpc\('save_outsourced_provider_v1', \{ p_provider_id: st\.sel, p_payload: payload \}\)/);
  assert.match(read('configuration-center.js'), /link\('Tercerizados','Grúas de afuera: datos y forma de pago\.','AuxTercerizados\.open\(\)'\)/);
  assert.match(read('Index.html'), /<script src="\/outsourced-providers-v1\.js\?v=/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});
