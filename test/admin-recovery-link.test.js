const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const edge = fs.readFileSync('supabase/functions/auxilios-admin/index.ts', 'utf8');
const ui = fs.readFileSync('sigma.js', 'utf8');

test('recovery link is generated only behind the existing admin authorization', () => {
  const handler = edge.slice(edge.indexOf('async function sendPasswordReset'), edge.indexOf('Deno.serve'));
  assert.match(handler, /await requireAdmin\(req\)/);
  assert.match(handler, /admin\.auth\.admin\.generateLink/);
  assert.match(handler, /type: "recovery"/);
  assert.match(handler, /action_link: actionLink/);
  assert.doesNotMatch(handler, /console\.(?:info|error|warn)\([^\n]*actionLink/);
});

test('admin UI displays the returned link as a value and offers copy action', () => {
  assert.match(ui, /id="rp-action-link"/);
  assert.match(ui, /linkInput\.value = data\.action_link/);
  assert.match(ui, /async function copiarLinkRecuperacion/);
  assert.match(ui, /navigator\.clipboard\.writeText\(input\.value\)/);
  assert.doesNotMatch(ui, /innerHTML\s*=\s*data\.action_link/);
});
