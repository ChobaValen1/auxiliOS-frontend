# Deudas pendientes (anotadas por el dueño)

Lista de mejoras para ir viendo con el tiempo. Se agregan abajo a medida que aparecen.

| # | Tema | Anotado | Estado |
|---|------|---------|--------|
| 1 | Servicios programados para los choferes | 14/10/2026 | Pendiente |
| 2 | Tema de pantalla: Blanco / Negro / Sistema | 14/10/2026 | Pendiente |
| 3 | Editar servicios finalizados (operadores) | 14/10/2026 | Pendiente |
| 4 | Tarifas que dependen del servicio principal | 14/10/2026 | Pendiente · **importante** |
| 5 | Chofer con más de un servicio en curso a la vez | 14/10/2026 | Pendiente · **para charlar** (va junto con la 1) |

## 1) Servicios programados para los choferes
Poder dejar servicios programados para un chofer, como una fila o cola de servicios que el chofer va viendo y tomando en orden. Se piensa junto con la 5.

## 2) Tema de pantalla
Un operador dijo que el fondo negro le molesta. Cada usuario tiene que poder elegir **Blanco**, **Negro** o **Sistema** (el que use el celular o la computadora).

## 3) Editar servicios finalizados (operadores)
Los operadores tienen que poder editar un servicio ya finalizado. El cambio se tiene que ver bien en el **Historial** y también en los datos de **Facturación**.

## 4) Tarifas que dependen del servicio principal (importante)
Algunos conceptos no tienen precio propio: toman el precio de un valor del servicio principal.

Ejemplo:

| Servicio principal | Movida | Km asfalto | Km ripio | Hora de Espera | Doble Cabina |
|---|---|---|---|---|---|
| Liviano | $1000 | $20 | $25 | = Movida → **$1000** | = Km → **$20** |
| Semipesado | $1300 | $28 | $32 | = Movida → **$1300** | = Km → **$28** |

- **Hora de Espera** cobra lo mismo que la **Movida** del servicio principal.
- **Doble Cabina** cobra lo mismo que el **Km** del servicio principal.
- Si cambia el precio del principal, el concepto que depende de él tiene que cambiar solo.
- Falta definir: en Doble Cabina, ¿toma el km de asfalto, el de ripio o el que corresponda a cada tramo?

## 5) Chofer con más de un servicio en curso a la vez (para charlar)
**Hoy:** el chofer no puede cargar ni hacer otro servicio hasta finalizar el que tiene en curso.
- La app no lo deja empezar un remito nuevo si tiene un servicio asignado sin terminar.
- La base tampoco acepta dos viajes del mismo chofer con horarios que se pisan.

**Lo que pasa en la calle:** a veces, con un servicio en curso, el chofer hace otro.

**Falta decidir:**
- ¿Cuántos servicios puede tener en curso a la vez? ¿Dos, o los que sean?
- ¿Cómo se cuentan los km de cada uno cuando se pisan?
- ¿Quién lo habilita: el chofer solo, o el operador al asignarle el segundo?
- Ejemplos reales de cuándo pasa.
