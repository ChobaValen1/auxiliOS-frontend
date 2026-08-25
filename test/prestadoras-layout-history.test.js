'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const companies = fs.readFileSync('empresas-v2.js','utf8');
const historyMigration = fs.readFileSync('migrations/20260818150000_company_configuration_history_v1.sql','utf8');

test('Listado canónico de Prestadoras mantiene la versión simplificada',()=>{
  assert.doesNotMatch(companies,/empv2-kpis/);
  assert.doesNotMatch(companies,/empv2-refresh/);
  assert.doesNotMatch(companies,/value="suspended"/);
  assert.doesNotMatch(companies,/>Suspendidas</);
  assert.match(companies,/<option value="active">Activo<\/option><option value="inactive">Inactivo<\/option>/);
  assert.match(companies,/<th>Prestadora<\/th><th>CUIT<\/th><th>Contacto<\/th><th>Estado<\/th><th>Acciones<\/th>/);
  assert.match(companies,/col:nth-child\(1\)\{width:28%\}/);
  assert.match(companies,/col:nth-child\(2\)\{width:17%\}/);
  assert.match(companies,/col:nth-child\(3\)\{width:32%\}/);
  assert.match(companies,/col:nth-child\(4\)\{width:13%\}/);
  assert.match(companies,/col:nth-child\(5\)\{width:10%\}/);
  assert.match(companies,/width:38px;height:38px;min-width:38px/);
  assert.match(companies,/data-empv2-action="view"/);
  assert.match(companies,/data-empv2-action="edit"/);
  assert.match(companies,/data-empv2-action="toggle"/);
  assert.match(companies,/>Visualizar<\/button>/);
  assert.match(companies,/>Modificar<\/button>/);
  assert.match(companies,/Deshabilitar':'Habilitar/);
  assert.match(companies,/function setCompanyStatus\(id,nextStatus=null\)/);
  assert.match(companies,/desactivarEmpresa:id=>setCompanyStatus\(id,'inactive'\)/);
});

test('Datos y Contactos usa columnas verticales y canales independientes',()=>{
  assert.match(companies,/empv2-general-columns/);
  assert.match(companies,/empv2-vertical-grid/);
  assert.match(companies,/contactChannel\('mail','Mail',contact\.email\)/);
  assert.match(companies,/contactChannel\('whatsapp','WhatsApp',contact\.whatsapp\)/);
  assert.match(companies,/contactChannel\('phone','Teléfono',contact\.phone\)/);
  assert.match(companies,/function channelIcon\(type\)/);
});

test('Parámetros y Bases habilitadas se muestran como bloques independientes',()=>{
  assert.match(companies,/empv2-billing-columns/);
  assert.match(companies,/<h3>Parámetros de facturación<\/h3>/);
  assert.match(companies,/<h3>Bases habilitadas<\/h3>/);
  assert.match(companies,/Todas tienen la misma jerarquía/);
});

test('Historial consume el RPC por prestadora y muestra valor anterior y nuevo',()=>{
  assert.match(companies,/get_company_configuration_history_v1/);
  assert.match(companies,/before_data/);
  assert.match(companies,/after_data/);
  assert.match(companies,/empv2-history-arrow/);
  assert.match(companies,/actor_name/);
  assert.match(companies,/Promise\.all\(\[fetchSummary\(companyId\),fetchAudit\(companyId\)\]\)/);
});

test('Auditoría de Prestadoras cubre ficha, contactos y corrige ID de servicios',()=>{
  assert.match(historyMigration,/CREATE TRIGGER companies_audit/);
  assert.match(historyMigration,/capture_audit_event\('company_id'\)/);
  assert.match(historyMigration,/CREATE TRIGGER company_contacts_audit/);
  assert.match(historyMigration,/capture_audit_event\('contact_id'\)/);
  assert.match(historyMigration,/DROP TRIGGER IF EXISTS company_service_settings_audit/);
  assert.match(historyMigration,/capture_audit_event\('company_service_setting_id'\)/);
});

test('RPC de historial relaciona cambios indirectos con la prestadora',()=>{
  assert.match(historyMigration,/company_billing_base_links/);
  assert.match(historyMigration,/company_billing_settings s/);
  assert.match(historyMigration,/company_service_settings/);
  assert.match(historyMigration,/company_rate_rules/);
  assert.match(historyMigration,/company_rate_rule_exceptions/);
  assert.match(historyMigration,/JOIN public\.company_contracts cc/);
  assert.match(historyMigration,/u\.full_name AS actor_name/);
  assert.match(historyMigration,/GRANT EXECUTE ON FUNCTION public\.get_company_configuration_history_v1\(uuid\) TO authenticated/);
});
