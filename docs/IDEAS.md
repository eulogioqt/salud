# Ideas para más adelante

Apuntadas para no perderlas. Se hacen cuando Eulogio lo pida.

## Día «de dormir a dormir»
Ahora el día va de 00:00 a 00:00. La comida de madrugada va al día que sigue abierto, que es lo que hacen MyFitnessPal o MacroFactor. Los pasos cortan a medianoche.
- Cuando haya más datos de pasos por horas, probar un algoritmo que detecte cuándo te acuestas (el primer hueco largo sin pasos después de la medianoche) y que acierte siempre. Validarlo con días reales antes de activarlo.
- Si un día no se duerme (se encadena con el siguiente), el corte vuelve a la medianoche.
- Los datos de sueño del iPhone (Conduit manda `SleepAnalysis`) servirían para Raquel. El Android de Eulogio no manda sueño.

## Ciclo (menstruación y píldora)
Tarjeta en Evolución (y su resumen en Hoy) con su ficha. **Activado por defecto en las mujeres** (sexo F del perfil), con opción de quitarlo en Ajustes; **oculto en los hombres**.

Lo que hacen las apps de referencia (Apple Salud «Seguimiento del ciclo», Clue, Flo) y nos sirve:
- **Registro del día** (un toque, como el 🎉): regla sí/no y flujo (manchado, poco, normal, mucho); síntomas (dolor, hinchazón, cabeza, acné, sensibilidad en el pecho, antojos, sueño, energía, ánimo). Opcionales: temperatura basal, test de ovulación.
- **Predicciones** de la próxima regla y de la ventana fértil a partir de la duración media de los ciclos (Apple y Clue usan los últimos ciclos registrados; mejoran con 3–6 ciclos). Se muestran como rango, no como día exacto.
- **Avisos de desviaciones** (Apple): ciclos irregulares, poco frecuentes, reglas muy largas o manchado persistente; sugieren consultarlo con un médico.
- **Factores del ciclo** (Apple): anticonceptivos (píldora, DIU, implante, parche, anillo), embarazo, lactancia. Con píldora combinada no hay ovulación ni ventana fértil: se predice el sangrado por deprivación en la semana de descanso.
- **Modo píldora** (Clue/Flo): aviso diario a su hora, pauta (21+7, 24+4, 28 continua), registro de toma olvidada.
- **Historial**: cada ciclo como una barra (días de regla, duración del ciclo) y medias de duración del ciclo y de la regla.

Lo que añadiríamos nosotros (lo que no hacen ellas, porque no tienen comida, peso y entreno juntos):
- Fases en las gráficas de Evolución (bandas de color) para ver el peso, el hambre y el rendimiento según la fase.
- **Peso**: en la fase lútea y la regla se retiene líquido (+0,5–2 kg). Marcarlo en la ficha del peso y no usar esos días para la calibración del gasto (o corregirlos).
- **Gasto**: en la fase lútea sube ~100–300 kcal/día; opción de subir el objetivo esos días.
- Estadísticas con filtros por fase y por tipo de día (regla, fiesta 🎉, comida fuera, entreno o descanso).
- Raquel: Apple Salud ya guarda «Menstruación» y Conduit puede mandarlo; leerlo de ahí para no apuntarlo dos veces.
- La píldora ya funciona como suplemento con su ciclo (21+7…): unirla con este módulo para predecir el sangrado.

Fuentes: [Apple · Seguimiento del ciclo](https://support.apple.com/120356), [Clue](https://apps.apple.com/us/app/clue-period-cycle-tracker/id657189652), [Flo](https://apps.apple.com/us/app/flo-cycle-period-tracker/id1038369065).

## Estructura de la web
- 4 pestañas: **Hoy** (el día), **Entreno**, **Comida** (la biblioteca) y **Evolución** (antes «Progreso»).
- Evolución: una tarjeta por tema (Peso, Comida, Pasos, Suplementos, Entreno) con el resumen del periodo (30 días por defecto). «Más» abre la ficha con todo (Peso y cuerpo = gráfica completa y báscula; Comida y gasto = medias, semanas, calibración y todos los días) y desde ella «Por días» abre la misma ficha que en Hoy, con ‹ › para cambiar de día. Tocar un día en una gráfica abre ese día.
- Navegación (hecho): en el móvil, barra abajo con iconos (como Instagram); en el ordenador, barra lateral con la cuenta abajo.

## Gráfica de peso
- En Evolución, la gráfica completa (pesajes, estimados, no cuenta, media y esperado). En Hoy, la minigráfica de 7 días: solo la línea gris, pesajes rellenos y estimados huecos.

## Otros
- Notificaciones en el móvil (PWA con Web Push o app con Capacitor).
- Revisar productos con Open Food Facts; catálogo de ejercicios de Hevy y Strength Level.
- SSE para que la web se actualice sola.
