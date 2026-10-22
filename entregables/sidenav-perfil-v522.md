# Sidenav: ritmo e identidad del usuario

Preview `sidenav-identidad-v524-20261022`.

- Apertura y cierre de 650 ms, sin demora adicional antes de empezar. Salir con el mouse sigue cerrando el menú aunque se haya elegido un módulo.
- El perfil aparece al pie del sidenav, junto al avatar existente, con nombre completo a su derecha y rol debajo. Lee `PERFIL_USUARIO.full_name` y el rol de la sesión; no contiene un usuario fijo.
- Arriba aparecen el ícono de AuxiliOS y el nombre de la organización configurado en Datos de empresa y firma. La lectura inicial solicita sólo `legal_name`, se comparte entre llamadas simultáneas y se conserva en memoria. No modifica datos ni permisos. Si falta el nombre o falla la lectura, conserva la marca original.
- El nombre completo puede ocupar varias líneas. Contraído queda sólo el avatar. El bloque permanece oculto en la barra móvil. El menú de cuenta conserva su control original y no se recorta con el texto.
- El perfil se actualiza cuando llega después del login, sin consultas adicionales de usuario ni cambios de autenticación. El encabezado refleja los cambios guardados desde Datos de empresa y firma.
- La preferencia de movimiento reducido elimina las transiciones. Colores e íconos del sistema conservados.

Verificación: TypeScript/compilación, navegación real con mouse y teclado, cierre sin segundo clic, preferencia de ancho, carga tardía y cambio de perfil, nombres largos y rol legible. Publicación limitada a la versión de prueba.
