# Ideas para más adelante

Apuntadas para no perderlas. Se hacen cuando Eulogio lo pida.

## Día «de dormir a dormir»
Ahora el día va de 00:00 a 00:00. La comida de madrugada va al día que sigue abierto, que es lo que hacen MyFitnessPal o MacroFactor. Los pasos cortan a medianoche.
- Cuando haya más datos de pasos por horas, probar un algoritmo que detecte cuándo te acuestas (el primer hueco largo sin pasos después de la medianoche) y que acierte siempre. Validarlo con días reales antes de activarlo.
- Si un día no se duerme (se encadena con el siguiente), el corte vuelve a la medianoche.
- Los datos de sueño del iPhone (Conduit manda `SleepAnalysis`) servirían para Raquel. El Android de Eulogio no manda sueño.

## Ciclo (menstruación y píldora)
Iría como una tarjeta más en Evolución (y su resumen en Hoy), con su ficha. No sería otra pestaña. **Activado por defecto en las mujeres** (sexo F del perfil), con opción de quitarlo en Ajustes; **oculto en los hombres** (se puede activar a mano).
- **Con píldora**: se configura el ciclo una vez (21+7, 24+4, continua…) y el día en que empieza el descanso. La regla se predice (suele venir el 2.º o 3.er día del descanso) y basta con confirmarla o moverla. La píldora sale como suplemento con su aviso.
- **Sin píldora**: se marca en Hoy cuándo empieza y cuándo acaba, como el 🎉. La app calcula la duración media del ciclo y predice la próxima.
- Opcional cada día: flujo (poco, normal, mucho), dolor, hinchazón, antojos, energía, ánimo.
- Fases (menstrual, folicular, ovulación, lútea) en Hoy y en los gráficos de Progreso. Útil porque en la fase lútea sube el gasto ~100–300 kcal, hay más hambre y se retiene líquido (el peso sube sin ganar grasa).
- Estadísticas con filtros por tipo de día: regla, fiesta 🎉, comida fuera, entreno o descanso. Para ver relaciones (hambre, kcal, peso, rendimiento en el gimnasio…).

## Estructura de la web
- 4 pestañas: **Hoy** (el día), **Entreno**, **Comida** (la biblioteca) y **Evolución** (antes «Progreso»).
- Evolución: una tarjeta resumen por tema para el periodo elegido (30 días por defecto); «Ver cada día» abre la misma ficha que en Hoy, con ‹ › para cambiar de día. Tocar un día en una gráfica abre ese día. Hecho en nov. 2026.
- Navegación propuesta (pendiente de confirmar): en el móvil, barra abajo con iconos (como Instagram); en el ordenador, barra lateral a la izquierda con la cuenta abajo.

## Gráfica de peso
- Hecho: en Evolución solo pesajes + media de 7 días; «estimado», «no cuenta» y «esperado» en la ficha del peso. En Hoy, la minigráfica gris de los últimos 14 días.

## Otros
- Notificaciones en el móvil (PWA con Web Push o app con Capacitor).
- Revisar productos con Open Food Facts; catálogo de ejercicios de Hevy y Strength Level.
- SSE para que la web se actualice sola.
