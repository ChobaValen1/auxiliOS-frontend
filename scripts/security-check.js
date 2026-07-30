'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = ['Index.html', 'sigma.js', 'supabase.js'];
const contents = Object.fromEntries(files.map((file) => [
  file,
  fs.readFileSync(path.join(root, file), 'utf8'),
]));

const forbidden = [
  { pattern: /\/api\/email-by-dni/, reason: 'El frontend no debe resolver email por DNI.' },
  { pattern: /Authorization[^\n]+SUPABASE_KEY/, reason: 'Las Edge Functions deben recibir el JWT del usuario.' },
  { pattern: /Contraseña inicial\s*:/i, reason: 'No se permiten contraseñas iniciales compartidas.' },
];

for (const [file, content] of Object.entries(contents)) {
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) {
      throw new Error(`${file}: ${rule.reason}`);
    }
  }
}

if (!contents['supabase.js'].includes('/api/login-by-dni')) {
  throw new Error('El login por DNI seguro no está configurado.');
}
if (!contents['sigma.js'].includes("apiAuthHeaders({ 'Content-Type': 'application/json' })")) {
  throw new Error('Las escrituras administrativas al backend deben incluir el JWT.');
}

console.log('Security checks: OK');
