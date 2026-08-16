const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const center=fs.readFileSync('configuration-center.js','utf8');

test('Configuración reconoce Servicios y Tarifas como módulos hijos',()=>{
  assert.match(center,/CONFIG_CHILD_ROUTES = new Set\(\[[^\]]*'config-services'[^\]]*'config-tariff-matrix'/s);
  assert.match(center,/'config-services': \{ title: 'CONFIGURACIÓN · SERVICIOS'/);
});

test('el flyout reconstruye todos los módulos canónicos cada vez que se abre',()=>{
  assert.match(center,/moveTo\(catalogs, document\.getElementById\('nav-config-services'\)\)/);
  assert.match(center,/addAction\(catalogs, '💳', 'Tarifas'/);
  assert.match(center,/function openCenter\(event\)[\s\S]*populateFlyout\(\);[\s\S]*setFlyout\(true\)/);
});

test('la pantalla central muestra accesos directos a Servicios y Tarifas',()=>{
  assert.match(center,/irModuloConfiguracion\('config-services'\)[\s\S]*<b>Servicios<\/b>/);
  assert.match(center,/irModuloConfiguracion\('config-tariff-matrix'\)[\s\S]*<b>Tarifas<\/b>/);
});
