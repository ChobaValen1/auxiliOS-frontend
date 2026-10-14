# Deudas pendientes (anotadas por el dueño)

Lista de mejoras para ir viendo con el tiempo. Se agregan abajo a medida que aparecen.

| # | Tema | Anotado | Estado |
|---|------|---------|--------|
| 1 | Servicios programados para los choferes | 14/10/2026 | Pendiente |
| 2 | Tema de pantalla: Blanco / Negro / Sistema | 14/10/2026 | Pendiente |
| 3 | Editar servicios finalizados (operadores) | 14/10/2026 | Pendiente |
| 4 | Tarifas que dependen del servicio principal | 14/10/2026 | Pendiente · **importante** |
| 5 | Chofer con más de un servicio en curso a la vez | 14/10/2026 | Definido · listo para hacer (va junto con la 1) |

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

## 5) Chofer con más de un servicio en curso a la vez
**Hoy:** el chofer no puede cargar ni hacer otro servicio hasta finalizar el que tiene en curso.
- La app no lo deja empezar un remito nuevo si tiene un servicio asignado sin terminar.
- La base tampoco acepta dos viajes del mismo chofer con horarios que se pisan.

**Lo que pasa en la calle:** a veces, con un servicio en curso, el chofer hace otro.

**Ya definido (14/10/2026):**
- Ejemplos: lleva un auto y en el camino levanta otro, o hace una UML mientras tiene otro servicio en curso.
- Puede tener **varios** servicios en curso a la vez, sin un máximo fijo.
- Cada servicio se factura con **sus propios km**, aunque compartan parte del camino.
- Los servicios en cola los toma **en orden**.
- El servicio en camino lo puede habilitar **cualquiera de los dos**: el operador asignándoselo, o el chofer empezándolo solo.
- Sueldos con "KM reales": se pagan los **km de la jornada** (lo que anduvo el camión), no la suma de los servicios.

**Propuesta:**
- **Cola del chofer:** el operador asigna varios servicios a un chofer y los ordena. El chofer los ve como "Mis servicios", en ese orden.
- **Sumar en camino:** con un servicio en curso, el chofer puede empezar el siguiente de la cola, o uno nuevo sin asignar, sin cerrar el anterior. Cada uno tiene su remito y su firma.
- **Km:** cada servicio guarda sus propios km para facturar. Los km del camión y de la jornada salen del odómetro de la jornada, así no se cuentan dos veces.
- **Base:** se quita la traba que impide dos viajes del mismo chofer con horarios que se pisan.

**Plan por etapas (14/10/2026):**
0. Preparación: crear un chofer y un móvil de prueba (se borraron los anteriores).
1. Base de datos: asignar a un chofer ocupado deja el servicio en su cola; cada servicio guarda su lugar en la cola; se quitan las trabas "chofer ocupado", "viaje en curso" y la de viajes que se pisan.
2. Operador: en Servicios se ve "En cola · 3º" y se puede subir o bajar el orden.
3. Chofer: "Mis servicios" en orden; solo empieza el siguiente; con uno en curso puede empezar el siguiente o agregar uno en el camino.
4. Km, Facturación, Sueldos y cierre de jornada: cada servicio con sus km; "KM reales" siguen saliendo de la jornada; al cerrar la jornada avisa qué servicios faltan.
5. Prueba completa con el chofer de prueba y pase a producción cuando se apruebe.

- Cierre de jornada (definido 14/10/2026): **no deja cerrarla** si hay servicios sin terminar y muestra cuáles faltan.

**Avance:**
- Etapa 1 (base) hecha el 14/10/2026. Todo queda detrás de un interruptor por chofer (`multi_service_v1`), **apagado para todos**: los choferes reales siguen igual que antes. Probado en la base sin guardar datos: 3 servicios a la vez, orden de la cola, traba de orden y mover en la cola.
- Etapa 2 (operador) hecha el 14/10/2026: en Servicios se ve "En curso · 1º de 4" / "En cola · 3º · siguiente", "N servicios" en Chofer, flechas para subir o bajar, y asignar a un chofer ocupado avisa en qué lugar quedó. Solo aparece para choferes con el interruptor.
- Falta para encenderlo: etapas 3 y 4 (pantallas) y quitar en la base la traba de viajes que se pisan (`sin_solapamiento_viajes`), que se hace al encender.
