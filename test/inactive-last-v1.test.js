const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// Todas las listas con estado muestran lo suspendido / inactivo / archivado al final,
// sin cambiar el orden del resto (Array.prototype.sort es estable).
const casos = [
  ['sigma.js', /usuarios\.slice\(\)\.sort\(\(a, b\) => \(a\.is_active === false \? 1 : 0\) - \(b\.is_active === false \? 1 : 0\)\)\.map\(u =>/, 'Usuarios'],
  ['sigma.js', /vehiculos\.slice\(\)\.sort\(\(a, b\) => \(a\.status === 'active' \? 0 : 1\) - \(b\.status === 'active' \? 0 : 1\)\)\.map\(v =>/, 'Flota (Configuración)'],
  ['sigma.js', /planes\.slice\(\)\.sort\(\(a, b\) => \(a\.activo \? 0 : 1\) - \(b\.activo \? 0 : 1\)\)\.map\(p =>/, 'Planes'],
  ['sigma.js', /_commissionCatalog\.slice\(\)\.sort\(\(a, b\) => \(a\.active \? 0 : 1\) - \(b\.active \? 0 : 1\)\)\.map\(c =>/, 'Comisiones'],
  ['toll-management.js', /\.sort\(\(a,b\)=>\(a\.is_active\?0:1\)-\(b\.is_active\?0:1\)\);\/\* archivados al final \*\//, 'Peajes'],
  ['empresas-v2.js', /\.sort\(\(a,b\)=>\(normalizedStatus\(a\.status\)==='active'\?0:1\)-\(normalizedStatus\(b\.status\)==='active'\?0:1\)\);/, 'Empresas'],
  ['billing-bases.js', /\}\)\.sort\(\(a, b\) => \(a\.is_active \? 0 : 1\) - \(b\.is_active \? 0 : 1\)\); \/\/ inactivas al final/, 'Bases'],
  ['service-types-catalog-v2.js', /\.sort\(\(a,b\)=>\(a\.is_active===false\?1:0\)-\(b\.is_active===false\?1:0\)\);/, 'Tipos de servicio'],
  ['tariff-types-catalog-v1.js', /S\.types\.slice\(\)\.sort\(\(a, b\) => \(a\.is_active === false \? 1 : 0\) - \(b\.is_active === false \? 1 : 0\)\)\.map\(type =>/, 'Tipos de tarifa'],
  ['fleet-control-v1.js', /\}\)\.sort\(function \(a, b\) \{ return \(estado\(a\)\.key === 'inactivo' \? 1 : 0\) - \(estado\(b\)\.key === 'inactivo' \? 1 : 0\); \}\);/, 'Control del camión'],
];
for (const [file, re, name] of casos) {
  test(`${name}: lo suspendido o inactivo va al final`, () => assert.match(read(file), re));
}

test('el orden es estable: los activos conservan su orden y los inactivos bajan', () => {
  const rows = [{ n: 'A', is_active: false }, { n: 'B', is_active: true }, { n: 'C', is_active: false }, { n: 'D', is_active: true }];
  const out = rows.slice().sort((a, b) => (a.is_active === false ? 1 : 0) - (b.is_active === false ? 1 : 0)).map(r => r.n).join('');
  assert.equal(out, 'BDAC');
});
