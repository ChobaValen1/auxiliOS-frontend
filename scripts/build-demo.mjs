import { mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Only runtime files enter the deployment. SQL, documentation and private data stay out.
const out = 'dist';
mkdirSync(out, { recursive: true });
const production = ['bcjcrlrrqfbipleiwkqi', 'auxilios.up.railway.app'];
function copy(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'ui-review') copy(from, to); }
    else copyFileSync(from, to);
  }
}
for (const entry of readdirSync('.', { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const name = entry.name;
  if (!/\.(js|css)$/.test(name) && !['Index.html', 'remito.html', 'manifest.json'].includes(name)) continue;
  if (/^(diagnose|fix-|server\.)/.test(name)) continue;
  let content = readFileSync(name, 'utf8');
  if (production.some(value => content.includes(value))) throw new Error(`Production connection in ${name}`);
  writeFileSync(join(out, name), content);
}
for (const dir of ['ui', 'assets']) if (existsSync(dir)) copy(dir, join(out, dir));
console.log('Demo build ready: isolated database, runtime files only.');
