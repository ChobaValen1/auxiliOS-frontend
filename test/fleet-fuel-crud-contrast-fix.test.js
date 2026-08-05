const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const styles = fs.readFileSync('fleet-fuel-crud-contrast-fix.css', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('fuel payment dropdown has explicit visible colors', () => {
  assert.match(styles, /\.ffcrud-form select/);
  assert.match(styles, /color-scheme:\s*dark/);
  assert.match(styles, /\.ffcrud-form select option/);
  assert.match(styles, /background-color:\s*#111722/);
  assert.match(styles, /color:\s*#f5f7fb/);
});

test('fuel dropdown contrast fix is loaded and cached in PWA v128 or later', () => {
  assert.match(flags, /fleet-fuel-crud-contrast-fix\.css/);
  assert.match(sw, /auxilios-v(?:12[8-9]|1[3-9]\d|[2-9]\d{2,})/);
  assert.match(sw, /'\/fleet-fuel-crud-contrast-fix\.css'/);
});
