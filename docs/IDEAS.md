# Ideas para más adelante

Apuntadas para no perderlas. Se hacen cuando Eulogio lo pida.

## Día «de dormir a dormir»
Ahora el día va de 00:00 a 00:00. La comida de madrugada va al día que sigue abierto, que es lo que hacen MyFitnessPal o MacroFactor. Los pasos cortan a medianoche.
- Cuando haya más datos de pasos por horas, probar un algoritmo que detecte cuándo te acuestas (el primer hueco largo sin pasos después de la medianoche) y que acierte siempre. Validarlo con días reales antes de activarlo.
- Si un día no se duerme (se encadena con el siguiente), el corte vuelve a la medianoche.
- Los datos de sueño del iPhone (Conduit manda `SleepAnalysis`) servirían para Raquel. El Android de Eulogio no manda sueño.

## Ciclo (menstruación y píldora)
Iría como una tarjeta más en Progreso, con su ficha. No sería otra pestaña. Solo aparece si la persona lo activa en Ajustes.
- **Con píldora**: se configura el ciclo una vez (21+7, 24+4, continua…) y el día en que empieza el descanso. La regla se predice (suele venir el 2.º o 3.er día del descanso) y basta con confirmarla o moverla. La píldora sale como suplemento con su aviso.
- **Sin píldora**: se marca en Hoy cuándo empieza y cuándo acaba, como el 🎉. La app calcula la duración media del ciclo y predice la próxima.
- Opcional cada día: flujo (poco, normal, mucho), dolor, hinchazón, antojos, energía, ánimo.
- Fases (menstrual, folicular, ovulación, lútea) en Hoy y en los gráficos de Progreso. Útil porque en la fase lútea sube el gasto ~100–300 kcal, hay más hambre y se retiene líquido (el peso sube sin ganar grasa).
- Estadísticas con filtros por tipo de día: regla, fiesta 🎉, comida fuera, entreno o descanso. Para ver relaciones (hambre, kcal, peso, rendimiento en el gimnasio…).

## Estructura de la web
- **Hoy**: el resumen del día. **Progreso** (quizá con otro nombre, p. ej. «Evolución»): el resumen de todo, con una tarjeta por tema que abre su ficha completa (peso, objetivo, pasos, suplementos, báscula, calibración, ciclo…). **Comida**: la biblioteca. **Entreno**: los entrenos.

## Gráfica de peso
- Propuesta: en Progreso solo pesajes + media de 7 días; «estimado», «no cuenta» y «esperado» en la ficha del peso.

## Otros
- Notificaciones en el móvil (PWA con Web Push o app con Capacitor).
- Revisar productos con Open Food Facts; catálogo de ejercicios de Hevy y Strength Level.
- SSE para que la web se actualice sola.
