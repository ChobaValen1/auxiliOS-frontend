const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sigma = read('sigma.js');
const excel = read('excel-export.js');
const payroll = read('payroll-view.js');
const invoices = read('operator-invoices.js');
const wizard = read('operator-service-wizard.js');
const billingExport = read('operator-billing-export.js');
const companyDocs = read('company-documents.js');

test('sigma expone los dos confirmadores de archivo sobre operationFeedback', () => {
  const descarga = sigma.match(/function confirmarDescarga\([\s\S]*?\n}/)?.[0] || '';
  const subida = sigma.match(/function confirmarSubida\([\s\S]*?\n}/)?.[0] || '';
  assert.ok(descarga, 'falta confirmarDescarga');
  assert.ok(subida, 'falta confirmarSubida');
  assert.match(descarga, /operationFeedback\('Descarga lista'/);
  assert.match(subida, /operationFeedback\('Archivo subido'/);
  // Son declaraciones de función a nivel global: así quedan en window y las
  // pueden usar los archivos que cargan aparte (un const no se exporta).
  assert.doesNotMatch(sigma, /const confirmarDescarga\b/);
  assert.doesNotMatch(sigma, /const confirmarSubida\b/);
});

test('toda descarga de Excel confirma desde el exportador compartido', () => {
  const fn = excel.match(/function download\(\{[\s\S]*?\n?\}$/m)?.[0] || excel.split('function download(')[1] || '';
  const write = fn.indexOf('writeFile');
  const confirm = fn.indexOf('confirmDownload');
  assert.ok(write >= 0, 'falta la escritura del archivo');
  assert.ok(confirm > write, 'la confirmación va después de entregar el archivo');
  assert.match(excel, /window\.confirmarDescarga/);
  assert.match(excel, /window\.operationFeedback/);
});

test('el CSV de sueldos también confirma, no solo el xlsx', () => {
  const fn = payroll.split('function download(format,filename,columns,data,sheets)')[1].split('function exportMonth')[0];
  assert.match(fn, /AuxiliosExcelExport\.download\(\{[\s\S]*?detalle\}\)/);
  assert.match(fn, /confirmarDescarga\(filename\+'\.csv'/);
});

test('las descargas propias de sigma confirman igual que el exportador', () => {
  assert.match(sigma, /confirmarDescarga\(`remitos_\$\{stamp\}\.xlsx`/);
  assert.match(sigma, /confirmarDescarga\(`plantilla_\$\{tipo\}\.xlsx`/);
});

test('subir un documento de camión o chofer muestra la validación', () => {
  const camion = sigma.split('async function subirDocCamion()')[1].split('async function subirDocChofer()')[0];
  const chofer = sigma.split('async function subirDocChofer()')[1].split('async function compartirDoc(')[0];
  assert.match(camion, /confirmarSubida\(file\.name, 'Documento guardado'\)/);
  assert.match(chofer, /confirmarSubida\(file\.name, 'Documento guardado'\)/);
  assert.doesNotMatch(camion, /toast\('Documento guardado'/);
  assert.doesNotMatch(chofer, /toast\('Documento guardado'/);
});

test('adjuntar el PDF de una factura y subir la firma de empresa confirman', () => {
  assert.match(invoices, /window\.confirmarSubida\(file\.name, 'PDF adjuntado a la factura'\)/);
  assert.match(companyDocs, /window\.confirmarSubida\(file\.name,'Firma institucional guardada'\)/);
});

test('modificar un servicio desde Facturación muestra la validación', () => {
  const save = wizard.split('async function save(')[1];
  assert.match(save, /returnToBilling\)confirmar\('Servicio actualizado'/);
  assert.match(save, /wasEdit\)confirmar\('Servicio actualizado'/);
  assert.doesNotMatch(save, /notify\('Servicio actualizado'/);
});

test('la exportación de Facturación no duplica aviso: confirma una sola vez', () => {
  const fn = billingExport.split('async function confirmExport()')[1].split('const exportCurrent=')[0];
  assert.match(fn, /excel\(\)\.download\(\{[^}]*detalle:/);
  assert.doesNotMatch(fn, /registros exportados a Excel/);
});
