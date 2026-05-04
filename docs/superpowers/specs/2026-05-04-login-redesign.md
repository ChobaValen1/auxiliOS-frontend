# Login Redesign — Spec

## Objetivo

Mejorar el login de AuxiliOS con identificación flexible (email o DNI), protección contra fuerza bruta, UX centrada en todos los dispositivos, y branding actualizado.

---

## Funcionalidades

### 1. Identificador único (auto-detect)

El campo de login acepta **email o DNI** en un solo input. La detección es automática:

- Si el valor contiene `@` → se interpreta como email, se autentica directamente con Supabase Auth.
- Si el valor es numérico (solo dígitos) → se busca el email asociado a ese DNI en la tabla `users` de Supabase, luego se autentica con ese email + contraseña.

Si el DNI no existe en `users`, se muestra: *"No encontramos una cuenta con ese DNI."*

**Flujo técnico (DNI):**
```
1. Query: SELECT email FROM users WHERE dni = <input>
2. Si no hay resultado → error "DNI no encontrado"
3. Si hay resultado → loginUsuario(email, password)
```

### 2. Rate limiting — 5 intentos

Implementado en localStorage (suficiente para el modelo de amenaza: choferes, no atacantes sofisticados).

- Cada intento fallido incrementa `sigma_login_attempts` en localStorage.
- Al llegar a 5 intentos, se guarda `sigma_login_locked_until = Date.now() + 15 * 60 * 1000`.
- Al cargar el formulario y al intentar login, se verifica si el bloqueo está activo.
- Si está bloqueado: se muestra *"Demasiados intentos. Intentá de nuevo en X minutos."* y el botón queda deshabilitado.
- Tras login exitoso: se limpian `sigma_login_attempts` y `sigma_login_locked_until`.

### 3. Reset de contraseña (solo admin)

En el panel de Alta de Usuarios, cada fila de usuario tiene un botón **"🔑 Cambiar contraseña"** que abre un modal con:
- Campo: nueva contraseña
- Campo: confirmar contraseña
- Validación: mínimo 8 caracteres, ambos campos coinciden
- Al confirmar: llama a `POST /api/reset-password` en `server.js` → `supabaseAdmin.auth.admin.updateUserById(userId, { password })`

---

## UX y Visual

### Centrado universal

El card de login usa `min-height: 100dvh` (dynamic viewport height) con flexbox centrado, para que funcione correctamente en mobile (evitando el problema del 100vh con la barra del navegador).

### Branding

- Reemplazar el texto "SIGMA / REMOLQUES" por la imagen principal de AuxiliOS.
- **Asset requerido:** `assets/logo-auxilios-main.png` (o el path que indique el usuario). Hasta que se provea, usar el ícono `assets/icons/icon-512.png` como fallback.
- La imagen va centrada arriba del card, con `max-width: 180px`.

### Estructura del card (mobile-first)

```
[ Logo AuxiliOS ]
"Iniciá sesión para continuar"

[ Email o DNI          ]
[ Contraseña      👁  ]

[ Ingresar → ]

[ Error / bloqueo msg  ]
```

- El ícono 👁 permite mostrar/ocultar la contraseña.
- El card tiene `width: 360px; max-width: 90vw` (igual al actual).

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase.js` | `mostrarPantallaLogin`, `ejecutarLogin`, `loginUsuario` — lógica auto-detect + rate limiting |
| `server.js` | Nuevo endpoint `POST /api/reset-password` |
| `Index.html` | Nada (el login se genera dinámicamente en JS) |
| `assets/logo-auxilios-main.png` | **A proveer** por el usuario |

---

## Lo que NO cambia

- El flow post-login (cargarPerfilUsuario, inicializarApp) — sin tocar.
- Supabase Auth como sistema de autenticación — sin cambios.
- El campo `dni` en la tabla `users` — ya existe (usado en Alta de Usuarios).
