const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('fleet-fuel-closed-edit-fix.js', 'utf8');
const styles = fs.readFileSync('fleet-fuel-closed-edit-fix.css', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

test('closed journey fuel edits are explicitly allowed in the UI', () => {
  assert.match(source, /La edición está permitida y quedará auditada/);
  assert.match(source, /Guardar corrección histórica/);
  assert.match(source, /form\.noValidate = true/);
});

test('fuel correction form validates fields visibly before the protected RPC runs', () => {
  assert.match(source, /showError\(form/);
  assert.match(source, /Ingresá una cantidad de litros mayor a cero/);
  assert.match(source, /Ingresá un precio por litro mayor a cero/);
  assert.match(source, /motivo de corrección de al menos 5 caracteres/);
  assert.match(styles, /\.ffcrud-inline-error/);
  assert.match(styles, /\[aria-invalid="true"\]/);
});

test('decimal values accept Argentine comma notation', () => {
  assert.match(source, /replace\(',', '\.'\)/);
  assert.match(source, /inputMode = 'decimal'/);
  assert.match(source, /2\.499,50/);
});

test('closed edit fix loads after the main fuel CRUD and is cached in PWA v129', () => {
  const mainIndex = flags.indexOf('/fleet-fuel-crud-v1.js');
  const fixIndex = flags.indexOf('/fleet-fuel-closed-edit-fix.js');
  assert.ok(mainIndex >= 0 && fixIndex > mainIndex);
  assert.match(flags, /fleet-fuel-closed-edit-fix\.css/);
  assert.match(sw, /auxilios-v129/);
  assert.match(sw, /'\/fleet-fuel-closed-edit-fix\.css'/);
  assert.match(sw, /'\/fleet-fuel-closed-edit-fix\.js'/);
  assert.match(pkg, /node --check fleet-fuel-closed-edit-fix\.js/);
});
