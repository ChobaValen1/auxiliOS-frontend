'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=f=>fs.readFileSync(f,'utf8');
const sql=read('migrations/20261015160000_activated_always_billable_v1.sql'),lifecycle=read('operator-service-lifecycle.js'),workspace=read('operator-service-workspace-reactive-v1.js'),wizard=read('operator-service-wizard.js');
test('la base rechaza cerrar un activado como no facturable',()=>{assert.match(sql,/Un servicio activado siempre se factura/);assert.match(sql,/activation_kind/);assert.match(sql,/activation_km/);assert.match(sql,/get_activation_route_points_v1/);});
test('Activado Origen calcula Base → Origen → Base con el mapa',()=>{const fn=lifecycle.split('async function activationOriginKm')[1].split('function openActivatedFinalize')[0];assert.match(fn,/get_activation_route_points_v1/);assert.match(fn,/routeMode:'base_origin_destination_base'/);assert.match(fn,/destination:point\(o\)/);});
test('el ingreso del chofer ofrece Origen o Movida, sin No facturable',()=>{const fn=workspace.split('function syncIntakeActivation')[1].split('\n')[0];assert.match(workspace,/origin:\['Activado Origen'/);assert.match(workspace,/movement:\['Activado Movida'/);assert.doesNotMatch(fn,/non_billable/);assert.match(workspace,/destination_lat:target\?\.data\?\.origin_lat/);});
test('el guardado del ingreso manda siempre facturable con el tipo de activado',()=>{assert.match(wizard,/p_payload:\{\.\.\.body,activation_kind:w\.activationKind\},p_billable:true/);assert.match(wizard,/Elegí Activado Origen o Activado Movida/);});
