const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = f => fs.readFileSync(f, 'utf8');

test('Historial de Servicios: trae todo el período desde el servidor, no sólo los últimos 500', () => {
  const sql = read('migrations/20261119120000_historial_servicios_completo_v1.sql');
  assert.match(sql, /create or replace function public\.list_operator_service_history_v1\(\s*p_from date default null, p_to date default null, p_limit integer default 500, p_offset integer default 0\)/);
  assert.match(sql, /s\.status in \('completed','cancelled'\)/);
  assert.match(sql, /at time zone 'America\/Argentina\/Buenos_Aires'\)::date >= p_from/);
  assert.match(sql, /'has_more',v_offset\+jsonb_array_length\(v_items\)<v_total/);
  assert.match(sql, /grant execute on function public\.list_operator_service_history_v1\(date,date,integer,integer\) to authenticated/);
  assert.doesNotMatch(sql, /create or replace function public\.list_operator_services\b/); // la lista general no cambia
  const js = read('operator-services.js');
  assert.match(js, /_db\.rpc\('list_operator_service_history_v1',\{p_from:range\.from,p_to:range\.to,p_limit:HISTORY_CHUNK,p_offset:offset\}\)/);
  assert.match(js, /if\(!data\?\.has_more\|\|!items\.length\)break;/);
  // Sin la función en la base, cae al tope máximo de la lista general.
  assert.match(js, /_db\.rpc\('list_operator_services',\{p_limit:1000\}\)/);
  assert.match(js, /if\(S\.view==='history'\)void loadHistory\(\);/);
});

test('Historial de Servicios: arranca en el mes en curso y ese período no cuenta como filtro', () => {
  const js = read('operator-services.js');
  assert.match(js, /periodSel:defaultHistoryPeriod\(\)/);
  assert.match(js, /timeZone:'America\/Argentina\/Buenos_Aires',year:'numeric',month:'2-digit'/);
  assert.match(js, /S\.view==='history'&&!isDefaultPeriod\(S\.periodSel\)\]\.filter\(Boolean\)\.length/);
  assert.match(js, /onFilterChange\(key,key==='period'\?defaultHistoryPeriod\(\):''\)/);
});

test('Historial de Servicios: peajes sólo de la página visible y resumen del período', () => {
  const js = read('operator-services.js');
  assert.doesNotMatch(js, /enrichServices\?\.\(S\.services,_db\)/);
  assert.match(js, /if\(S\.view==='history'\)void loadPageTolls\(rows\);/);
  assert.match(js, /render\(s\.historyTolls,\{compact:true\}\)/);
  assert.match(js, /function renderHistoryStats\(all\)/);
  const tolls = read('ui/history-tolls-list-v1.js');
  assert.match(tolls, /function render\(data,\{heading=false,compact=false\}=\{\}\)/);
  const css = read('operator-services.css');
  assert.match(css, /#screen-operaciones\.os-is-history \.os-commandbar \.os-manage\{display:none\}/);
});

test('Servicios: Activos baja una lista liviana y los remitos sólo de los servicios que se ven', () => {
  const js = read('operator-services.js');
  assert.match(js, /_db\.rpc\('list_operator_active_services_v1',\{p_limit:500\}\)/);
  assert.match(js, /_db\.rpc\('list_operator_service_document_connections_v3',\{p_service_ids:ids\.slice\(i,i\+500\)\}\)/);
  // Sin las funciones nuevas en la base vuelve a las anteriores.
  assert.match(js, /_db\.rpc\('list_operator_services',\{p_limit:500\}\)/);
  assert.match(js, /_db\.rpc\('list_operator_service_document_connections_v2'\)/);
  // El historial pide los remitos de sus filas, no todos.
  assert.match(js, /const ids=rows\.map\(r=>String\(r\.service_id\)\),res=await fetchDocuments\(ids\)/);
  assert.doesNotMatch(js, /Promise\.all\(\[_db\.rpc\('list_operator_services'/);
  const sql = read('migrations/20261120150000_servicios_activos_liviano_v1.sql');
  assert.match(sql, /revoke all on function public\.list_operator_active_services_v1\(integer\) from public, anon/);
});

test('Historial: tocar una fila abre un panel de solo lectura; importes y facturación sólo para Administración', () => {
  const js = read('operator-services.js');
  assert.match(js, /abrirDetalleHistorial\('\$\{s\.service_id\}'\)/);
  assert.match(js, /verServicioOperador\('\$\{s\.service_id\}'\)/);
  assert.match(js, /const canSeeBilling=\(\)=>\['administracion','facturacion'\]\.includes\(role\(\)\)/);
  assert.match(js, /showBilling:billing&&done/);
  assert.match(js, /get_operator_billing_service_detail_v5_km_v1/);
  assert.match(js, /canEdit:canEditHistoryService\(s\)/);
  assert.match(js, /window\.AuxiliosHistoryDetail\?\.refresh\(\)/);
  const panel = read('ui/history-detail-panel-v1.js');
  assert.match(panel, /window\.AuxiliosHistoryDetail=\{init/);
  assert.match(panel, /e\.key==='Escape'/);
  assert.match(panel, /Abrir completo/);
  // Mapa compartido: un solo google.maps.Map para todo el panel.
  assert.match(panel, /if\(!MAP\.map\)MAP\.map=new maps\.Map/);
  assert.match(panel, /ServiceRouteMap/);
  // El desglose sólo se pide si el modelo lo habilita (Administración/Facturación).
  assert.match(panel, /if\(m\.showBilling\)\{loadBilling/);
  const html = read('Index.html');
  assert.match(html, /history-detail-panel-v1\.js/);
  assert.match(read('sw.js'), /history-detail-panel-v1\.css/);
  assert.match(read('ui/history-detail-panel-v1.css'), /@media\(max-width:720px\)/);
});

test('Historial: la ficha desliza, muestra base, km facturables y quién cambió el servicio', () => {
  const panel = read('ui/history-detail-panel-v1.js');
  const css = read('ui/history-detail-panel-v1.css');
  const host = read('operator-services.js');
  assert.match(panel, /classList\.add\('is-open'\)/);
  assert.match(css, /transform:translateX\(100%\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(panel, /bd\.kilometros\(q/);
  assert.match(panel, /view-cambios/);
  assert.match(host, /get_operator_service_history_v2/);
  assert.match(host, /billing_base_name,s\.branch_name/);
  assert.doesNotMatch(panel, /hd-when/);
});

test('Historial compacto: título arriba, sin resumen ni conteo, tabla con alto propio y volver con peso visual', () => {
  const js = read('operator-services.js'), css = read('operaciones-ax-v1.css');
  assert.match(js, /SCREENS\.operaciones\.title='Historial de servicios'/);
  assert.match(js, /function fitHistoryWrap\(\)/);
  assert.match(css, /os-is-history #os-history-heading \{ display: none; \}/);
  assert.match(css, /#screen-operaciones \.os-results-line \{ display: none; \}/);
  assert.match(css, /os-back-btn \{ border-color: var\(--ax-accent\)/);
  assert.doesNotMatch(js, /finalizado\$\{done===1/);
});

test('Servicios activos comparte el formato: sin línea de conteo y con encabezados fijos', () => {
  const js = read('operator-services.js'), css = read('operaciones-ax-v1.css');
  assert.match(css, /#screen-operaciones \.os-results-line \{ display: none; \}/);
  assert.match(js, /function fitHistoryWrap\(\)\{[^}]*os-map-mode/);
});

test('los filtros de prestadora, chofer y móvil se acotan entre sí (opciones en cascada)', () => {
  const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'operator-services.js'), 'utf8');
  assert.match(src, /function filtered\(ignoreStatus=false,skip=''\)/);
  assert.match(src, /skip==='driver'\|\|!S\.driverFilter/);
  assert.match(src, /tally\('driver',serviceDriverId\)/);
});
