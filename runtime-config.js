/* Configuración de la instalación (base de datos, servidor y edición).
   Este archivo trae los valores de Sigma. Al publicar en Vercel, scripts/build-runtime-config.cjs
   lo reescribe solo si están cargadas las variables AUXILIOS_* (ver el script).
   Así el mismo código sirve para otra instalación, por ejemplo la del monogruero. */
window.AUXILIOS_RUNTIME = Object.freeze({
  edition: 'sigma',
  supabaseUrl: 'https://bcjcrlrrqfbipleiwkqi.supabase.co',
  supabaseKey: 'sb_publishable_daGVg7URncTvLzC7N8NzOA_Z0CWB-1M',
  apiBaseUrl: 'https://auxilios.up.railway.app'
});
