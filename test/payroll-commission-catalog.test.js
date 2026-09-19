const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20260916142139_payroll_commission_catalog.sql', 'utf8');
const data = fs.readFileSync('supabase.js', 'utf8');
const ui = fs.readFileSync('sigma.js', 'utf8');
const html = fs.readFileSync('Index.html', 'utf8');
const matrix = fs.readFileSync('payroll-matrix.js', 'utf8');

test('commissions have one global catalog and explicit driver assignments', () => {
  assert.match(migration, /create table if not exists public\.payroll_commission_rules/);
  assert.match(migration, /create table if not exists public\.payroll_commission_assignments/);
  assert.match(migration, /primary key \(commission_id, driver_id\)/);
  assert.match(migration, /unique \(source, concept_id\)/);
  assert.match(migration, /enable row level security/g);
});

test('assignment replacement is admin-only and validates active drivers and rules', () => {
  assert.match(migration, /current_auxilios_role\(\) <> 'administracion'/);
  assert.match(migration, /r\.name <> 'chofer'/);
  assert.match(migration, /r\.active is false/);
  assert.match(migration, /revoke all on function public\.set_payroll_commission_assignments/);
  assert.match(migration, /grant execute on function public\.set_payroll_commission_assignments/);
});

test('legacy embedded rules migrate without losing Sergio assignments', () => {
  assert.match(migration, /jsonb_array_elements/);
  assert.match(migration, /insert into public\.payroll_commission_assignments/);
  assert.match(migration, /jsonb_set\(compensation_matrix, '\{commissions\}', '\[\]'::jsonb/);
});

test('payroll settings hydrate assigned global rules and persist assignments separately', () => {
  assert.match(data, /async function cargarPayrollCommissionData/);
  assert.match(data, /assigned_driver_ids/);
  assert.match(data, /set_payroll_commission_assignments/);
  assert.match(data, /compensation_matrix: \{\.\.\.normalized, commissions: \[\]\}/);
  assert.match(data, /assignedByDriver\.get\(u\.user_id\)/);
});

test('scheme UI creates rules globally and selects them individually or in bulk', () => {
  assert.match(html, /Comisiones por conceptos/);
  assert.match(html, /🎯 Comisiones y Bonos/);
  assert.match(html, /id="cfg-commission-body"/);
  assert.match(ui, /function _renderCommissionCatalog/);
  assert.match(ui, /_abrirComisionGeneral/);
  assert.match(ui, /_guardarComisionGeneral/);
  assert.match(ui, /data-bulk-commission/);
  assert.match(html, /id="modal-comision-payroll"/);
  assert.match(html, /id="esqm-commission-mode"/);
  assert.match(matrix, /data-commission-id/);
  assert.doesNotMatch(matrix, /\+ Comisión/);
});
