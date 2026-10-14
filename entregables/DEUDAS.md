# Deudas pendientes (anotadas por el dueño)

Lista de mejoras para ir viendo con el tiempo. Se agregan abajo a medida que aparecen.

| # | Tema | Anotado | Estado |
|---|------|---------|--------|
| 1 | Servicios programados para los choferes | 14/10/2026 | Pendiente |
| 2 | Tema de pantalla: Blanco / Negro / Sistema | 14/10/2026 | Pendiente |
| 3 | Editar servicios finalizados (operadores) | 14/10/2026 | Pendiente |
| 4 | Tarifas que dependen del servicio principal | 14/10/2026 | Pendiente · **importante** |

## 1) Servicios programados para los choferes
Poder dejar servicios programados para un chofer, como una fila o cola de servicios que el chofer va viendo y tomando en orden.

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
