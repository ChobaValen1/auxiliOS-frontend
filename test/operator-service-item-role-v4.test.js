const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const pricing=fs.readFileSync('migrations/20260811224500_operator_rate_items_pricing_v4.sql','utf8');
const roles=fs.readFileSync('migrations/20260819124500_operator_service_item_roles_v4.sql','utf8');

test('operator_service_items admite los roles generados por Tarifario v4',()=>{
  assert.match(pricing,/'role', 'movement'/);
  assert.match(pricing,/'role', 'distance'/);
  assert.match(pricing,/v_component->>'role'/);
  assert.match(roles,/item_role IN \('primary','secondary','movement','distance'\)/);
});
