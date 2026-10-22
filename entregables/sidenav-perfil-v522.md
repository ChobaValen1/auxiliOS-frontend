# Sidenav: ritmo e identidad del usuario

Preview `sidenav-perfil-v523-20261022`.

- Apertura y cierre de 650 ms, sin demora adicional antes de empezar. Salir con el mouse sigue cerrando el menú aunque se haya elegido un módulo.
- El perfil aparece al pie del sidenav, junto al avatar existente, con nombre completo a su derecha y rol debajo. La marca AuxiliOS se mantiene arriba. Lee `PERFIL_USUARIO.full_name` y el rol de la sesión; no contiene un usuario fijo.
- El nombre completo puede ocupar varias líneas. Contraído queda sólo el avatar. El bloque permanece oculto en la barra móvil. El menú de cuenta conserva su control original y no se recorta con el texto.
- Se actualiza cuando llega el perfil después del login; no agrega consultas ni modifica la autenticación. Antes de tener un nombre conserva la marca existente.
- La preferencia de movimiento reducido elimina las transiciones. Colores e íconos del sistema conservados.

Verificación: TypeScript/compilación, navegación real con mouse y teclado, cierre sin segundo clic, preferencia de ancho, carga tardía y cambio de perfil, nombres largos y rol legible. Publicación limitada a la versión de prueba.
