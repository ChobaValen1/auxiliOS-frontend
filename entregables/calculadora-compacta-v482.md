# Calculadora compacta · v482

- Publicación: sólo Preview, rama `claude/auxilios-3zj57q`.
- Ventana de hasta 860×560 px en escritorio, menor que el formulario principal de hasta 1298 px. En móvil, altura limitada al 86% de la pantalla.
- Dos columnas: Modalidad, precios, kilómetros, peajes y adicionales a la izquierda; Desglose, total y Usar presupuesto a la derecha. Campos de 32 px en escritorio; 44 px y letra de 16 px en móvil.
- El desglose puede desplazarse sin ocultar el total ni la acción en escritorio. En móvil se apilan las secciones y el encabezado sigue accesible.
- Se conserva el foco y el desplazamiento al cambiar de modalidad, agregar o quitar filas; Escape vuelve al formulario, sin descartarlo.
- Sin cambios en fórmulas, tarifas, persistencia ni base de datos. El total se aplica al formulario sólo al pulsar Usar presupuesto.
- QA local con módulos y estilos reales, RPC simuladas y capturas de escritorio/móvil: dimensiones, columnas, campos compactos, total, no desbordamiento, importe 44.500, aplicación/cancelación y mínimo ya cobrado.
- 17 pruebas focalizadas aprobadas, incluyendo separación del total y limpieza de resultados inválidos; controles de sintaxis y seguridad aprobados.
