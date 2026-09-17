const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const center=fs.readFileSync('configuration-center.js','utf8');

test('Configuración reconoce Servicios y Tarifas como módulos hijos',()=>{
  assert.match(center,/CONFIG_CHILD_ROUTES = new Set\(\[[^\]]*'config-services'[^\]]*'config-tariff-matrix'/s);
  assert.match(center,/'config-services': \{ title: 'CONFIGURACIÓN · SERVICIOS'/);
});

test('Configuración abre las áreas sin superponer el flyout',()=>{
  assert.match(center,/moveTo\(catalogs, document\.getElementById\('nav-config-services'\)\)/);
  assert.match(center,/addAction\(catalogs, '💳', 'Tarifas'/);
  assert.match(center,/function openCenter\(event\)[\s\S]*closeFlyout\(\);[\s\S]*renderCenter\(\)/);
});

test('la pantalla central muestra accesos directos a Servicios y Tarifas',()=>{
  assert.match(center,/route\('Servicios',.*'config-services'\)/);
  assert.match(center,/route\('Tarifas',.*'config-tariff-matrix'\)/);
});

test('Configuración conserva en un único centro los módulos estructurales disponibles',()=>{
  for(const label of ['Prestadoras','Bases geográficas','Tipos de servicio','Tipos de tarifa','Peajes','Servicios','Tarifas','Personal / Choferes','Camiones','Planes de mantenimiento','Mantenimiento','Contactos de emergencia','Documentación','Grilla','Sueldos','Mi cuenta'])assert.match(center,new RegExp(label));
});
