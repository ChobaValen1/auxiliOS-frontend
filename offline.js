// offline.js — Outbox offline-first para operaciones del chofer
//
// Modelo: cada escritura que el chofer hace sin conexión se encola como una
// "op" en IndexedDB (DB: SigmaOutboxDB v1) y se reproduce en orden estricto
// cuando vuelve la señal. Los archivos (fotos/firmas) se guardan como Blobs
// en un store aparte y se suben recién al sincronizar. Las ops que generan
// un id en el servidor (ej. abrir jornada → log_id) usan un id provisorio
// 'TMP-*'; al sincronizar, el id real se guarda en la tabla idmap y las ops
// posteriores que referencien ese TMP- se remapean antes de ejecutarse.
//
// Stores:
//   ops   { id (autoIncrement), tipo, payload, blobs: {campo: blobKey},
//           dependeDe (tempId|null), tempId (si la op genera un id),
//           estado: 'pendiente'|'error', errorMsg, createdAt }
//   blobs { key (string, keyPath), blob (Blob), mime }
//   idmap { tempId (string, keyPath), realId }
//
// Sync (obSync): recorre las ops en orden por id. Las ops en 'error' se
// saltean (quedan para reintento manual). Una dependencia (dependeDe) se
// considera resuelta si el tempId está en idmap O si ya no queda ninguna op
// pendiente/error con ese tempId (op procesada = dependencia satisfecha,
// caso remitos que se encadenan por nro y no por id). Si el handler falla,
// la op pasa a 'error' con su mensaje y el sync sigue con las ops que no
// dependan de ella.

const OB_DB = 'SigmaOutboxDB';
const OB_DB_VERSION = 1;
let _obHandlers = {};          // tipo -> async (payload, blobsResueltos) => ({ realId? })
let _obSyncEnCurso = false;
let _obDbPromise = null;

function obRegistrarHandler(tipo, fn) { _obHandlers[tipo] = fn; }
function obTempId() { return 'TMP-' + Date.now() + '-' + Math.floor(Math.random() * 1e4); }

// ── Apertura de la DB ──────────────────────────────────────────────────────
function _obOpen() {
  if (_obDbPromise) return _obDbPromise;
  _obDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(OB_DB, OB_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('ops')) {
        db.createObjectStore('ops', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('idmap')) {
        db.createObjectStore('idmap', { keyPath: 'tempId' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { _obDbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { _obDbPromise = null; reject(req.error); };
  });
  return _obDbPromise;
}

// ── Helpers de promisificación ─────────────────────────────────────────────
function _obReq(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function _obStoreGet(storeName, key) {
  const db = await _obOpen();
  return _obReq(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

async function _obStorePut(storeName, valor) {
  const db = await _obOpen();
  return _obReq(db.transaction(storeName, 'readwrite').objectStore(storeName).put(valor));
}

async function _obStoreDelete(storeName, key) {
  const db = await _obOpen();
  return _obReq(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key));
}

async function _obStoreGetAll(storeName) {
  const db = await _obOpen();
  return _obReq(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

// ── Conversión dataURL → Blob ──────────────────────────────────────────────
async function _obABlob(valor) {
  if (valor instanceof Blob) return valor;
  if (typeof valor === 'string' && valor.startsWith('data:')) {
    const res = await fetch(valor);
    return await res.blob();
  }
  throw new Error('Blob inválido: se esperaba Blob o dataURL');
}

// ── API pública ────────────────────────────────────────────────────────────

// Encola una operación. blobs: { campo: Blob|dataURL }
async function obAdd({ tipo, payload, blobs = null, dependeDe = null, tempId = null }) {
  const blobKeys = {};
  if (blobs) {
    for (const campo of Object.keys(blobs)) {
      if (blobs[campo] == null) continue;
      const blob = await _obABlob(blobs[campo]);
      const key = `${tipo}_${Date.now()}_${campo}_${Math.floor(Math.random() * 1e4)}`;
      await _obStorePut('blobs', { key, blob, mime: blob.type || 'application/octet-stream' });
      blobKeys[campo] = key;
    }
  }
  const op = {
    tipo,
    payload,
    blobs: blobKeys,
    dependeDe: dependeDe || null,
    tempId: tempId || null,
    estado: 'pendiente',
    errorMsg: null,
    createdAt: new Date().toISOString()
  };
  const db = await _obOpen();
  const id = await _obReq(db.transaction('ops', 'readwrite').objectStore('ops').add(op));
  await _obActualizarIndicador();
  if (navigator.onLine) setTimeout(obSync, 100);
  return id;
}

// Lista todas las ops ordenadas por id (getAll de un store con keyPath
// autoIncrement ya devuelve en orden de clave).
async function obPendientes() {
  return await _obStoreGetAll('ops');
}

// Cantidad total de ops (pendientes + error)
async function obCount() {
  const ops = await _obStoreGetAll('ops');
  return ops.length;
}

// Borra una op y sus blobs asociados
async function obEliminar(id) {
  const op = await _obStoreGet('ops', id);
  if (op && op.blobs) {
    for (const campo of Object.keys(op.blobs)) {
      try { await _obStoreDelete('blobs', op.blobs[campo]); } catch (e) { /* no crítico */ }
    }
  }
  await _obStoreDelete('ops', id);
  await _obActualizarIndicador();
}

// Limpia el estado de error de una op (vuelve a 'pendiente') y dispara el sync.
async function obReintentar(id) {
  const op = await _obStoreGet('ops', id);
  if (!op) return;
  op.estado = 'pendiente';
  op.errorMsg = null;
  await _obStorePut('ops', op);
  await _obActualizarIndicador();
  if (navigator.onLine) setTimeout(obSync, 100);
}

// Si valor es un tempId 'TMP-*', devuelve el realId del idmap o null si aún
// no se sincronizó la op que lo genera. Si no es TMP-, devuelve el valor tal cual.
async function obResolverRef(valor) {
  if (typeof valor !== 'string' || !valor.startsWith('TMP-')) return valor;
  const entrada = await _obStoreGet('idmap', valor);
  return entrada ? entrada.realId : null;
}

// Resuelve todos los valores 'TMP-*' de primer nivel del payload vía idmap.
// Si alguno no se puede resolver, devuelve null (la op debe esperar).
async function _obResolverPayload(payload) {
  const copia = Object.assign({}, payload);
  for (const campo of Object.keys(copia)) {
    const v = copia[campo];
    if (typeof v === 'string' && v.startsWith('TMP-')) {
      const real = await obResolverRef(v);
      if (real === null) return null;
      copia[campo] = real;
    }
  }
  return copia;
}

// ¿Está resuelta la dependencia? Sí si el tempId figura en idmap, O si ya no
// queda ninguna op pendiente/error con ese tempId (op procesada y borrada).
async function _obDependenciaResuelta(tempId, ops) {
  const enMapa = await _obStoreGet('idmap', tempId);
  if (enMapa) return true;
  const viva = ops.some(o => o.tempId === tempId);
  return !viva;
}

// Sincroniza el outbox: reproduce las ops en orden contra los handlers.
async function obSync() {
  if (!navigator.onLine || _obSyncEnCurso) return;
  _obSyncEnCurso = true;
  let sincronizadas = 0;
  try {
    const ops = await obPendientes();
    // tempIds cuya op falló o quedó esperando en ESTE ciclo → sus dependientes se saltean
    const bloqueados = new Set();

    for (const op of ops) {
      try {
        if (op.estado === 'error') {
          if (op.tempId) bloqueados.add(op.tempId);
          continue;
        }
        if (op.dependeDe) {
          if (bloqueados.has(op.dependeDe)) {
            if (op.tempId) bloqueados.add(op.tempId);
            continue;
          }
          const resuelta = await _obDependenciaResuelta(op.dependeDe, ops);
          if (!resuelta) {
            if (op.tempId) bloqueados.add(op.tempId);
            continue;
          }
        }

        const handler = _obHandlers[op.tipo];
        if (!handler) {
          // Sin handler registrado todavía (ej. script que no cargó): esperar
          if (op.tempId) bloqueados.add(op.tempId);
          continue;
        }

        // Resolver referencias TMP-* dentro del payload (ej. log_id)
        const payload = await _obResolverPayload(op.payload || {});
        if (payload === null) {
          if (op.tempId) bloqueados.add(op.tempId);
          continue;
        }

        // Cargar blobs del store
        const blobsResueltos = {};
        if (op.blobs) {
          for (const campo of Object.keys(op.blobs)) {
            const entrada = await _obStoreGet('blobs', op.blobs[campo]);
            blobsResueltos[campo] = entrada ? entrada.blob : null;
          }
        }

        const resultado = await handler(payload, blobsResueltos);

        // Éxito: mapear id real si corresponde y borrar op + blobs
        if (op.tempId && resultado && resultado.realId != null) {
          await _obStorePut('idmap', { tempId: op.tempId, realId: resultado.realId });
        }
        await obEliminar(op.id);
        sincronizadas++;
      } catch (err) {
        // Falla del handler: marcar error y seguir con las no-dependientes
        try {
          op.estado = 'error';
          op.errorMsg = (err && err.message) ? err.message : String(err);
          await _obStorePut('ops', op);
        } catch (e2) {
          console.error('[outbox] No se pudo marcar la op en error:', e2);
        }
        if (op.tempId) bloqueados.add(op.tempId);
        console.error(`[outbox] Op #${op.id} (${op.tipo}) falló:`, err);
      }
    }
  } catch (err) {
    console.error('[outbox] Error general en obSync:', err);
  } finally {
    _obSyncEnCurso = false;
    await _obActualizarIndicador();
    if (sincronizadas > 0 && typeof toast === 'function') {
      toast(`Se sincronizaron ${sincronizadas} operación${sincronizadas === 1 ? '' : 'es'} pendiente${sincronizadas === 1 ? '' : 's'} ✅`, 'success');
    }
  }
}

// Notifica a la UI el estado de la cola
async function _obActualizarIndicador() {
  let count = 0;
  try { count = await obCount(); } catch (e) { /* DB no disponible */ }
  window.dispatchEvent(new CustomEvent('outbox-changed', { detail: { count } }));
}

window.addEventListener('online', () => setTimeout(obSync, 1500));
window.addEventListener('load',   () => setTimeout(obSync, 3000));
