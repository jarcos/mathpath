# Plan de mejora de MathPath

_2 de noviembre de 2026 · basado en una revisión del código (`v0.1.4`, commit `9323248`) y del contenido._

## Diagnóstico en una frase

MathPath ya tiene **mucho contenido verificado** (241 lecciones, **1055 ejercicios**, 15 asignaturas) y una base técnica sana,
pero **todavía no enseña**: registra cada intento en SQLite y no hace nada con él. No hay repaso, ni dominio
real, ni adaptación. La lección se marca como "completada" a mano. La mayor ganancia está en convertir la app de
un _libro con ejercicios_ en un _tutor_. Para eso no hay que tocar el principio offline-first.

### Datos que respaldan el plan

| Hallazgo | Dato |
|---|---|
| Los intentos se guardan pero solo se usan para pintar ✓ | `attempts` solo se lee en `getSolvedExercises` ([db.js:100](src/main/db.js#L100)) |
| Completar una lección es un botón manual, sin relación con los ejercicios | [LessonView.jsx:189](src/renderer/src/pages/LessonView.jsx#L189) |
| El 34 % de los ejercicios son de **una sola palabra exacta** (`text`) | 362 de 1055, con coincidencia exacta y sin tolerancia a tildes ni erratas |
| En 17 ejercicios de "factoriza / desarrolla / simplifica" se acepta **el propio enunciado** | `validateAnswer('x^2 - 5x + 6', algebra-02-e4)` da `true` |
| Muy pocos recursos visuales | **14 gráficas** en todo el currículo, y 10 asignaturas no tienen ninguna |
| Muy pocos ejercicios de programación en la pista de IA | **16** ejercicios `code` en total |
| La explicación es corta para el tiempo estimado | unas 190 palabras de prosa y ejemplos en inglés por lección, frente a 35–45 min estimados |
| No hay tests, ni CI en PRs, ni migraciones de BD | solo existe `release.yml`, que se lanza con tags |

---

## Fase 0: errores y seguridad (1–2 días, antes que nada)

| # | Problema | Dónde | Arreglo |
|---|---|---|---|
| 0.1 | **Path traversal en el servidor loopback.** `/....%2F%2F....%2F%2F....%2F%2Fetc/passwd` acaba en `/etc/passwd` (comprobado). Cualquier proceso local, o una web con DNS rebinding, puede leer ficheros del usuario. | [index.js:55](src/main/index.js#L55) | `resolve()` y comprobar `startsWith(root + sep)`. Validar también la cabecera `Host` (`127.0.0.1:<port>`). |
| 0.2 | **El ✓ de cada ejercicio no se restaura al reabrir.** `Exercise` inicializa `result` desde `solved` solo al montarse, y `LessonView` carga `solved` de forma asíncrona. El contador dice "3 de 5" pero las tarjetas no muestran el ✓. | [Exercise.jsx:13](src/renderer/src/components/Exercise.jsx#L13), [LessonView.jsx:92](src/renderer/src/pages/LessonView.jsx#L92) | `useEffect` que sincronice `solved → result`, o no renderizar los ejercicios hasta tener `solved`. |
| 0.3 | **El CI de release no ejecuta `verify`.** Llama a `npx electron-builder` directamente y se salta `predist`. | [release.yml](.github/workflows/release.yml) | Añadir `verify:content` + `verify:glossary` (y `verify:code` con `setup-python`). |
| 0.4 | **Python se ejecuta en el hilo de la UI.** Un `while True: pass` en un ejercicio congela la app entera. | [pyodide.js](src/renderer/src/lib/pyodide.js) | Mover Pyodide a un **Web Worker** con timeout y botón "Detener" (`worker.terminate()`). |
| 0.5 | **El test multirrespuesta enseña la respuesta correcta al primer fallo**, y luego basta con marcarla para que cuente como "resuelto". | [Exercise.jsx:94](src/renderer/src/components/Exercise.jsx#L94) | Al fallar, explicar solo la opción elegida. Revelar la correcta tras un 2.º fallo o al pedir la solución, y registrarlo. |
| 0.6 | **Riesgo: el corrector de código de la app no es el del verificador.** La app compara con `valuesClose` tras `toJs()`: un `dict` llega como `Map` y un `np.array` como `TypedArray`, y ninguno de los dos pasa `Array.isArray`. `verify-code.py` corrige en CPython. Una solución correcta podría marcarse como mala. | [pyodide.js:91](src/renderer/src/lib/pyodide.js#L91) | Normalizar (`dict_converter: Object.fromEntries`, `Array.from` en typed arrays) o comparar dentro de Python. Añadir un test que pase las soluciones de referencia por **Pyodide**. |
| 0.7 | Endurecer Electron: `sandbox: false`, `shell.openExternal` con cualquier esquema y sin bloquear `will-navigate`. | [index.js:93](src/main/index.js#L93), [index.js:99](src/main/index.js#L99) | Preload en CJS + `sandbox: true`. Abrir fuera solo `https:`. Bloquear la navegación. |
| 0.8 | Limpieza | varios | Quitar `function-plot` (no se usa). Corregir el comentario obsoleto de `app://` en `electron-builder.yml`. Actualizar los totales de CLAUDE.md (972 → 1055 ejercicios). Traducir el `title` del botón de tema ([App.jsx:31](src/renderer/src/App.jsx#L31)). Hacer que el `starter` de código cambie con el idioma. |

### Estado de la Fase 0: hecha y publicada en v0.1.5 (hito M27)

Todo lo anterior está implementado y probado. Se ha probado de tres formas:
- con Node (servidor loopback y Pyodide);
- con el renderer en el navegador y la API simulada;
- con una **build empaquetada real**, firmada ad-hoc y con datos aislados: preload con sandbox, servidor, bloqueo de navegación, scikit-learn en el worker, y el ✓ que sobrevive a un reinicio.

| # | Resultado |
|---|---|
| 0.1 | Servidor movido a `src/main/rendererServer.js`. Hace `resolve` y comprueba el prefijo, valida `Host` y solo acepta GET/HEAD. Traversal → 404, Host ajeno → 403, POST → 405. |
| 0.2 | `Exercise` sincroniza `solved → result`. Comprobado tras recargar y tras reiniciar la app empaquetada. |
| 0.3 | Nuevo job `verify` en `release.yml` (mathjs, glosario, CPython y Pyodide). `build` depende de él. |
| 0.4 | Python corre en `lib/pyodide.worker.js`, con botón **Detener** y corte a los 30 s de ejecución. Con un bucle infinito, la UI sigue fluida (≤ 3 ms de retraso en temporizadores). |
| 0.5 | El test multirrespuesta explica solo la opción elegida. Al 2.º fallo revela la correcta y se bloquea, sin contar como resuelto. |
| 0.6 | **Corrección:** no era un fallo en la versión antigua. Pyodide devuelve un `LiteralMap` y `TypedArray`, y `valuesClose` los aceptaba por casualidad. **Sí lo habría sido al pasar al worker**: `postMessage` convierte el `LiteralMap` en un `Map` normal. Ahora la conversión se hace en Python (`src/shared/pygrade.js`), compartida con el nuevo gate `npm run verify:pyodide`. Ese gate pasa las 16 soluciones y los 362 snippets por el Pyodide empaquetado en unos 6 s. Ya ha encontrado un problema real: en Pyodide, `import pandas` imprimía un aviso largo sobre `pyarrow` en la salida del alumno, y ahora se silencia. |
| 0.7 | `sandbox: true` con el preload en CJS (`index.cjs`). Solo se abren enlaces `https` (en el navegador del sistema) y `will-navigate` bloquea la salida de la app. |
| 0.8 | Hecho. Además: el código del alumno puede importar cualquier paquete empaquetado aunque el ejercicio no lo declare (`loadPackagesFromImports`), y las trazas de error ya no muestran los frames internos de Pyodide. |

**Arreglado tras una revisión independiente del diff:**
- La cola de trabajos vive en el hilo principal. Detener o agotar el tiempo afecta solo al trabajo que corre, y los que esperan siguen en un worker nuevo. Antes de esto, un trabajo en cola heredaba el veredicto y un ejercicio podía registrar un intento fallido falso.
- Cada componente cancela su propia ejecución, también al salir de la lección.
- El servidor cierra el fichero si el cliente aborta la descarga (`pipeline`).
- El harness no se rompe si el alumno sobrescribe `list`, `str`…
- Cada snippet corre en un namespace limpio, igual que en los dos verificadores.
- `LIB_TO_PKG` queda en un único sitio (`pygrade.js`).

**Pendiente para la Fase 1** (resuelto en los últimos flecos de la Fase 1):
- ~~El bloqueo del test multirrespuesta se reinicia al reabrir la lección.~~
- ~~Con 3 opciones y 2 intentos, adivinando se acierta 2 de cada 3 veces.~~
- ~~El dominio (1.2) debería contar solo los aciertos a la primera. `attempts` ya guarda cada elección.~~

---

## Fase 1: motor de aprendizaje (la mejora de más impacto)

### 1.1 Repaso espaciado (FSRS)
- Cada ejercicio resuelto pasa a ser una **tarjeta de repaso** programada con [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (FSRS v6: MIT, puro JS, offline).
- La nota se calcula sola: acierto a la primera = *Good*, con pista o solución = *Hard*, fallo = *Again*.
- Nueva sección **"Repaso de hoy"** en el Dashboard que **intercala** ejercicios de distintas lecciones y asignaturas ya vistas.
- Tabla nueva `review_cards(exercise_id, due, stability, difficulty, reps, lapses, state, last_review)`.

### 1.2 Dominio en lugar de "marcar como completada"
- La lección se completa sola con ≥ 80 % de ejercicios resueltos **sin ver la solución**. Se mantiene el override manual.
- Niveles visibles: *nuevo · practicado · dominado · toca repasar* (cuando FSRS dice que la retención cae).
- Ampliar `attempts` con `used_hint`, `used_solution`, `time_ms`.

### Estado de 1.1 y 1.2: hechos (hito M28, publicado en v0.2.0)

Implementado como estaba previsto, con estos ajustes:

- **Librería:** [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) **5.4.2**, que implementa FSRS v6. La 6.x exige Node ≥ 24 y el proyecto usa Node 22. Se usan intervalos en días (`enable_short_term: false`), porque los repasos son sesiones diarias.
- **Notas:**
  - en la lección, el *primer acierto* crea la tarjeta: a la primera = *Good*; con pista o tras fallar = *Hard*; tras ver la solución = *Again*;
  - en el repaso puntúa *solo el primer intento*; los reintentos se registran sin puntuar.
- **Datos:**
  - `review_cards` guarda la tarjeta FSRS en JSON, más `due` para las consultas;
  - la migración 2 crea las tarjetas a partir de los aciertos anteriores, así que el historial de 0.1.x cuenta desde el primer día;
  - las migraciones están versionadas con `PRAGMA user_version`;
  - una base migrada sigue funcionando si vuelves a 0.1.5.
- **Interfaz:**
  - tarjeta "Repaso de hoy" en el Dashboard;
  - sesión de hasta 20 ejercicios que alterna lecciones, con "Volverá dentro de N días" tras cada respuesta;
  - "Resuelve N más sin abrir la solución" en cada lección;
  - insignias *Practicada · Dominada · Toca repasar* en la lección y en la lista de la asignatura.
- **Tests:** `npm test` (node --test, sin dependencias nuevas), con 18 tests de reglas, FSRS, base de datos y migración desde un esquema 0.1.x. El job `verify` del CI también los ejecuta.

**Arreglado tras una revisión independiente del diff:**
- **Contenido:** el id `algebra-02-e6` estaba duplicado (un numérico y un MCQ), así que contaba doble en el dominio y uno de los dos nunca se repasaba. El MCQ pasa a `algebra-02-e8`, y `verify:content` exige ahora ids únicos.
- **Base de datos:**
  - antes de migrar se guarda una copia (`mathpath.db.before-v2`);
  - si la base no se puede abrir, la app avisa en vez de quedarse en blanco;
  - solo puede haber una instancia abierta, así que dos procesos no pueden migrar la misma base a la vez.
- **Tarjetas:**
  - se sincronizan en cada arranque (`syncCards`), lo que cubre también volver a 0.1.5 y actualizar otra vez;
  - las atrasadas se reparten: como mínimo 10 al día, en unas dos semanas, en vez de vencer todas a la vez;
  - las de ejercicios que ya no existen no se muestran ni se cuentan.
- **Robustez:**
  - un reloj atrasado ya no rompe el repaso;
  - un fallo al programar la tarjeta no impide guardar el intento.
- **Interfaz:**
  - abrir la solución *mientras corre Python* ya cuenta;
  - si Python no llega a arrancar, no cuenta como fallo del alumno;
  - desmarcar a mano una lección dominada se respeta;
  - el estado se refresca al volver a la ventana (por si cambia el día con la app abierta);
  - el resumen de la sesión es coherente si se saltan todos los ejercicios.
- ~~**Matiz conocido:** ts-fsrs cuenta los días transcurridos por fecha UTC. Un repaso justo después de medianoche local puede contar como "0 días", lo que afecta un poco a las tarjetas de 1 día.~~ Resuelto en los últimos flecos de la Fase 1.

### 1.3 Grafo de prerrequisitos
- Pasar los 117 bloques `prereq` a un campo `prerequisites: [lessonId]` en cada lección (hoy 124 lecciones no tienen ninguno) y validarlo en `verify`: que los ids existan y que no haya ciclos.
- Usos:
  - Avisar al abrir una lección con prerrequisitos flojos.
  - Proponer la lección base cuando fallan los repasos.
  - Crédito implícito al estilo *FIRe* de [Math Academy](https://mathacademy.com/how-our-ai-works): repasar un tema avanzado cuenta como repaso parcial de sus bases. Hecho en los últimos flecos de la Fase 1.
- **Mapa visual del currículo** (DAG en SVG) que también sirva para navegar.

### 1.4 Ejercicios parametrizados (variantes)
- Plantillas con parámetros aleatorios, por ejemplo `"Deriva $f(x)={a}x^{n}$"` con respuesta `"{a}*{n}*x^({n}-1)"`. El verificador **muestrea N instancias** y comprueba cada una con mathjs.
- Imprescindible para que el repaso no se convierta en memorizar resultados. Además habilita un botón "practicar más".

### Estado de 1.4 y 3.5: hechos (hito M31, publicado en v0.2.0)

- **Plantillas** (`src/shared/params.js`):
  - `params` con rangos enteros (`int`, `exclude`) o `choices`, valores `derived` y una condición `where` (todo mathjs);
  - huecos `[[a]]` y `[[a|+]]` (término con signo, para que no salga "x + -3"). Se usan `[[…]]` y no `{…}` para no chocar con las llaves de LaTeX;
  - instancias deterministas por semilla, con el mismo id, así que progreso y repaso se comparten entre instancias.
- **Verificación:**
  - cada plantilla debe traer un `check` independiente (condición mathjs sobre parámetros y `answer`) o `equivalentTo` (p. ej. `derivative('[[a]]*x^[[n]]', 'x')`);
  - `verify:content` prueba 40 instancias de cada una: huecos rellenos, respuesta y alternativas, el check, y que todo el TeX renderice en KaTeX. Las comprobaciones pasan de 2151 a 3643;
  - comprobado que detecta una respuesta mal calculada, un hueco desconocido y TeX roto.
- **Contenido:** 12 ejercicios convertidos (ecuaciones lineales ×3, raíces de una cuadrática, evaluar f(x), pendiente, derivada por la regla de la potencia, pendiente de la tangente, integral definida, determinante 2×2, producto escalar y media). Los demás siguen igual; convertir más es trabajo de contenido.
- **App:**
  - en la lección, una instancia nueva por visita y un botón "Otro como este" tras responder;
  - en el repaso y la prueba de nivel, una instancia nueva cada vez.
- **Examen por asignatura (3.5):**
  - 12 preguntas de lecciones al azar (prefiere plantillas), mezcladas y sin pistas;
  - cada respuesta cuenta como repaso. Se aprueba con un 80 % a la primera;
  - al final, las lecciones que repasar. El último resultado se guarda y se muestra en la asignatura.

**Arreglado tras una revisión independiente** (sin bloqueantes):
- **Hueco real en el gate:** las alternativas de los ejercicios `set` se comparaban también consigo mismas, así que cualquier alternativa pasaba. Afectaba a los 8 `set` ya existentes; todos eran correctos.
  - Ahora se comparan solo con la respuesta canónica.
  - Las plantillas tienen que atar el `check` a la respuesta: `answer` en las numéricas, `answers` (como lista) en las `set` y `equivalentTo` en las de expresión.
  - Comprobado: una plantilla con la respuesta `[[r1]], [[r1]]` ya no pasa.
- **Coma decimal:** "22,5" se acepta como 22.5 en respuestas numéricas, cosa que importa ahora que hay plantillas con resultados decimales. Es lo primero de 2.4, con sus tests (`test/validate.test.js`).
- **Formato:** los números ya no salen como `1e+5`.
- **Plantillas:** sin "1x" en una ecuación ni `x^{1}` en una derivada.
- **Interfaz:**
  - una plantilla ya resuelta reaparece sin responder (el progreso lo sigue contando);
  - "Otro como este" garantiza números distintos;
  - las variantes se reinician al cambiar de lección;
  - un resultado tardío tras "No lo sé" ya no duplica la nota en examen y prueba de nivel;
  - el examen se guarda en cuanto respondes la última pregunta;
  - una fecha de examen corrupta ya no rompe la asignatura.
- **Tests:** 39.

### 1.5 Test de nivel por asignatura
- Entre 10 y 15 preguntas que marcan lecciones como sabidas, para que un adulto que ya domina parte del temario no empiece desde cero.

### 1.6 Planificador global
- Objetivo del usuario (por ejemplo "llegar a Transformers en 6 meses", N min/día) **entre asignaturas**, respetando el grafo de prerrequisitos.
- Repartir por `estimatedMinutes` y no por número de lecciones, incluyendo la carga de repaso del día.
- Racha, objetivo diario y mapa de calor de actividad. Todo local.

### Estado de 1.3, 1.5 y 1.6: hechos (hito M30, publicado en v0.2.0)

- **Grafo** (`src/shared/curriculum.js`): cada lección depende de la anterior de su asignatura y de las lecciones de su caja "Antes de esta lección" (había 136 enlaces, 4 entre asignaturas). Si es la primera de su asignatura, depende además de las asignaturas de un campo nuevo `requires` en `subjects.json`. En total, **311 enlaces**.
  - `verify:content` exige que todo prerrequisito exista y vaya antes en el orden del currículo. Eso descarta ciclos y hace que ordenar por ese orden dé un orden de estudio válido.
  - Los `requires` elegidos (revisables):
    - funciones ← álgebra; cálculo ← funciones; álgebra lineal ← álgebra; aplicaciones lineales ← álgebra lineal; estadística ← funciones;
    - ML ← cálculo + álgebra lineal + estadística; redes ← ML; deep learning ← redes;
    - NLP, visión y RL ← deep learning; representación del conocimiento ← estadística; inferencia activa ← estadística + redes;
    - fundamentos de IA, sin requisitos.
- **Mapa del currículo:** un punto por lección, coloreado por nivel. Al elegir una lección se ven de qué parte y qué se apoya en ella, también entre asignaturas. La caja "Antes de esta lección" muestra el nivel de cada prerrequisito y avisa si alguno está sin practicar o toca repasarlo. Cada asignatura muestra de cuáles parte, con su progreso.
- **Prueba de nivel por asignatura:** una pregunta por lección, sin pistas ni solución, que se para tras 2 fallos seguidos. Las lecciones acertadas se marcan como completadas, y el acierto crea su tarjeta de repaso, así que lo "sabido" se comprueba después.
- **Mi plan:**
  - objetivo = completar una asignatura, N min/día;
  - calcula todas las lecciones previas que faltan y las reparte por minutos estimados. El primer día descuenta los repasos reales (2 min cada uno, como mucho la mitad del día); los siguientes reservan un 25 %;
  - una lección empieza en el día si cabe o si queda al menos medio día; las largas continúan al siguiente;
  - muestra fecha estimada de fin, lecciones de hoy, próximos días, racha y mapa de actividad de 18 semanas;
  - con un objetivo, la tarjeta "Continuar" del Dashboard pasa a ser "Tu plan de hoy".
- **Arreglo de paso:** abrir una lección de otra asignatura (desde un prerrequisito) hacía que "Volver" llevara a la asignatura equivocada.
- **Tests:** 30 (grafo, planificador, racha, actividad por día local).

**Tras la revisión independiente** (sin bloqueantes):
- **Arreglado:**
  - el mapa de actividad perdía la celda de hoy en la hora del cambio de hora;
  - un `studyGoal` con minutos inválidos o una asignatura sin lecciones rompía el plan, y ahora se valida al leerlo;
  - en la prueba de nivel, un reintento ya no crea tarjeta;
  - una asignatura sin preguntas posibles ya no rompe la prueba;
  - la racha ya no está limitada a ~133 días.
- **Limitaciones conocidas:**
  - ~~un MCQ acertado al azar en la prueba de nivel marca la lección~~: resuelto en los últimos flecos de la Fase 1;
  - ~~el plan no descuenta lo ya estudiado hoy~~: resuelto en el cierre de la Fase 1;
  - ~~un doble clic en "No lo sé" puede saltarse una pregunta~~: resuelto en los últimos flecos de la Fase 1.

### Cierre de la Fase 1 (publicado en v0.2.1)

Tres flecos que quedaban de 1.3, 1.4 y 1.6:

- **Ayuda al fallar un repaso (1.3):** aparece "¿Te cuesta? Repasa", con la lección del ejercicio y hasta 3 prerrequisitos aún sin dominar, cada uno con su nivel.
- **Objetivo diario (1.6):**
  - Mi plan y la tarjeta "Tu plan de hoy" muestran "Hoy: X de Y min", u "Objetivo del día cumplido";
  - cuentan los minutos estimados de las lecciones completadas hoy más 2 min por repaso respondido;
  - el plan descuenta ese tiempo del día, así que al completar una lección la siguiente ya no pasa a ser "de hoy" si no queda tiempo;
  - las lecciones que marca la prueba de nivel no cuentan. Para distinguirlas, `lesson_progress` guarda el origen (`manual`, `mastery` o `placement`) en una columna nueva: es la migración 3, con copia `mathpath.db.before-v3`;
  - la racha cuenta el día de hoy en cuanto hay algo estudiado, aunque sea una lección completada sin responder ejercicios.
- **Más plantillas (1.4):** 10 más, 22 en total:
  - ecuación lineal con coeficiente negativo, raíces de x² − c y discriminante;
  - evaluar x² + k en un negativo y resolver f(x) = y;
  - derivada de ax² + bx e integral de 2x con límites negativos;
  - norma con ternas pitagóricas;
  - mediana de 4 datos desordenados y media de 3.

  Las comprobaciones de `verify:content` pasan a 4901.
- **Cursivas:** 60 lecciones usan `*cursiva*` de Markdown (162 casos, en EN y ES), y se veían con los asteriscos porque `MathText` solo entendía `**negrita**`. Ahora se muestran en cursiva. Los productos escritos en prosa, como `2*3` o `a*r^k`, se dejan como están.
- **Tests:** 41.
- **Probado en la build empaquetada,** con datos aislados:
  - la migración 3 se aplica;
  - completar una lección suma sus minutos, desmarcarla los resta y la prueba de nivel no suma;
  - un repaso fallado muestra la ayuda y suma 2 min.

**Tras la revisión independiente** (sin bloqueantes):
- **Arreglado:**
  - con lo ya estudiado, la regla de "medio día" comparaba con lo que quedaba y no con el día entero, así que tras 45 de 60 min una lección de 40 seguía siendo "de hoy". Tiene test;
  - la mediana mostraba los datos siempre en el mismo orden, y bastaba promediar el primero y el último. Ahora hay 4 órdenes, con los dos centrales en sitios distintos;
  - "Hoy: 0 de N min" ya no aparece un instante mientras se leen los minutos;
  - el origen de la lección se valida en el proceso principal;
  - con el objetivo del día cumplido, la tarjeta del Dashboard dice "Lo siguiente de tu plan" en vez de "Tu plan de hoy";
  - un asterisco pegado a una fórmula (`$a$*$b$`) ya no se toma como cursiva.
- **Se dejó así, y se cerró después** (en los últimos flecos):
  - la integral de 2x da 0 en un 8 % de las instancias, con límites simétricos. Es correcto, y ahora la solución explica por qué: 2x es impar;
  - las raíces de x² − c tenían 11 variantes; ahora 19;
  - los repasos de hoy no excluían ejercicios retirados del contenido; ahora sí.

### Últimos flecos de la Fase 1 (publicado en v0.2.2)

Lo que quedaba abierto de la Fase 1 y de la Fase 0, para darla por terminada:

- **Crédito implícito (1.3, estilo FIRe):** un repaso limpio (*Good*) de una lección cuenta en parte para las lecciones en las que se apoya.
  - Las tarjetas de esos prerrequisitos que vencen en los próximos 7 días se mueven la mitad del camino hacia donde las pondría un repaso *Good* hoy.
  - Nunca se adelantan, nunca pasan de ahí y nunca pasan del día en que el recuerdo previsto bajaría del 85 %. Su memoria (estabilidad, repeticiones, último repaso) no cambia.
  - Las tarjetas que ya han vencido no reciben crédito: les toca su propio repaso, porque pueden estar olvidadas.
  - Un repaso con pista, tras fallar o con la solución no da crédito. Las respuestas del examen cuentan como repaso, así que también dan crédito.
- **Días locales en FSRS:** ts-fsrs cuenta los días entre repasos por fecha UTC. Ahora las fechas entran desplazadas a la hora local, así que un repaso a las 00:30 cuenta como "al día siguiente" de uno a las 23:30.
- **Preguntas que se pueden adivinar** (opción múltiple y respuestas sí/no; hay 67 y 25):
  - para el dominio solo cuentan si se aciertan a la primera: el primer acierto llegó sin fallos previos, o se acertaron a la primera en un repaso o examen posterior. `attempts` guarda ahora los fallos previos de cada respuesta y dónde se dio (lección, repaso o prueba de nivel). Es la migración 4, con copia `mathpath.db.before-v4`, y las respuestas anteriores a la migración se dan por buenas;
  - un test bloqueado tras 2 fallos sigue bloqueado si se reabre la lección ese día, con el aviso "Sin intentos por hoy". Solo cuentan los fallos en la propia lección, no los del repaso, el examen o la prueba de nivel;
  - al bloquearse, el test recibe una tarjeta de repaso (*Again*), así que vuelve al día siguiente para responderlo de nuevo;
  - la prueba de nivel no las usa: todas las lecciones tienen otras preguntas.
- **Doble clic:** en la prueba de nivel, el examen y el repaso, el segundo clic de un doble clic ya no cae en el botón de la pregunta siguiente.
- **Tests:** 51 (días locales, también en un huso por detrás de UTC y con cambio de hora; crédito implícito; migración 4; aciertos a la primera; tests bloqueados; fallos de hoy).

**Tras la revisión independiente:**
- **Bloqueante, arreglado:** tras un fallo en un test de opción múltiple, "Comprobar" seguía activo. Un doble clic reenviaba la misma opción, gastaba el último intento y dejaba el test bloqueado todo el día. Ahora la opción marcada como fallada no se puede reenviar hasta elegir otra.
- **Arreglado:**
  - los fallos del examen, del repaso o de la prueba de nivel bloqueaban el test en la lección, con un aviso que prometía un repaso que no existía;
  - el crédito implícito podía aplazar tarjetas muy atrasadas, justo las que más probablemente están olvidadas. Ahora excluye las vencidas y respeta el límite del 85 %;
  - volver a acertar en la lección una pregunta adivinable ya resuelta al segundo intento la contaba como acertada a la primera;
  - un error al dar el crédito implícito ya no cambia la fecha que se muestra del repaso hecho.
- La revisión probó la conversión de zona horaria con 240.000 repasos simulados en 10 husos, entre ellos Kiritimati, Pago Pago, Lord Howe y St. John's. No encontró fallos.
- **Probado en la build empaquetada,** con datos aislados: un repaso limpio de "Ecuaciones de primer grado" movió la tarjeta de "Expresiones algebraicas" del 5 al 6 de noviembre sin tocar su memoria. El test bloqueado se mantuvo al reabrir la lección, con su tarjeta para el día siguiente. El doble clic en "No lo sé" avanzó una sola pregunta.

---

## Fase 2: mejores ejercicios

| # | Mejora | Detalle |
|---|---|---|
| 2.1 | **Vista previa de la expresión** mientras se escribe | `math.parse(x).toTex()` + KaTeX bajo el input. Deja ver ambigüedades como `1/2x`. Más adelante, opcional: [MathLive](https://cortexjs.io/mathlive) (npm, empaquetable) con teclado de símbolos. |
| 2.2 | **Feedback que explica** | Distinguir "no entiendo lo que has escrito" de "incorrecto". En conjuntos, decir "2 de 3 correctos". Añadir un campo `commonMistakes: [{answer, feedback:{en,es}}]` con mensajes para errores típicos (signo, regla de la cadena…). El verificador comprueba que **no** son equivalentes a la respuesta. |
| 2.3 | **Restricción de forma** (arregla los 17 ejercicios afectados) | `requireForm: "factored" \| "expanded" \| "simplified" \| "decimal"`, comprobado sobre el árbol de mathjs: producto de factores, sin paréntesis, número de términos… |
| 2.4 | **Respuestas de texto más tolerantes** | Normalización NFD (tildes), una errata permitida en palabras de 5 letras o más y plural simple. Así desaparece la mayoría de `acceptedAlt` del tipo `si`/`sí`. Convertir en test los ejercicios que son conceptuales. |
| 2.5 | Pistas graduadas y *worked examples* que se retiran poco a poco | `hint` pasa a ser un array. El primer ejercicio de cada lección es "completa el paso que falta". |
| 2.6 | **Comprobación paso a paso** (diferencial) | El alumno escribe su desarrollo línea a línea y mathjs comprueba que cada línea es equivalente a la anterior (o que conserva las soluciones de la ecuación). Señala **en qué paso** se equivocó, sin conexión. |
| 2.7 | Editor de código de verdad | CodeMirror 6 (offline, ligero): tabulación, números de línea y, por test, la tabla entrada / esperado / obtenido. |

---

## Fase 3: contenido

1. **Huecos del currículo para llegar a ML.** Cálculo solo tiene 12 lecciones y le faltan **Taylor, derivadas parciales, gradiente, jacobiano, hessiano, regla de la cadena multivariable y Lagrange**, que es justo la base de *backprop*. Propuesta: una asignatura nueva, "Cálculo multivariable y optimización" (≈ 14 lecciones), entre `linear-maps` y `ml-foundations`.
2. **Más profundidad donde más rinde.** Empezar por la escalera matemática (álgebra → cálculo → lineal), que alimenta todo lo demás. Cada lección suma un segundo ejemplo resuelto, un recuadro de **"errores comunes"** y un **"lo esencial"** final.
3. **Visualizaciones** (hoy hay 14 gráficas):
   - Ampliar `FunctionGraph`: varias curvas, puntos, recta tangente y **deslizadores de parámetros**.
   - Tipos de sección nuevos, todos con mathjs y verificables en build:
     - `vector2d`: transformación de la cuadrícula, clave para `linear-maps`.
     - `distribution`: normal o binomial con deslizadores.
     - `scatter`: regresión.
     - `heatmap`: convolución y atención.
4. **Más ejercicios de "impleméntalo tú"** en la pista de IA (hay 16 en total): softmax, un paso de descenso del gradiente, puntuaciones de atención, actualización de Q-learning…, corregidos con Pyodide.
5. **Examen de cierre por asignatura** con ejercicios intercalados de todas sus lecciones.
6. **Lint de ortografía en español** dentro de `verify`. Un diccionario pequeño ya detecta unas 63 palabras sin tilde (`limite`, `numero`, `solucion`…), sobre todo en notas de prerrequisito y comentarios de código.

---

## Fase 4: navegación y experiencia

- **Historial real**: atrás y adelante (Cmd+[ y el botón del ratón). Al reabrir, restaurar la última vista y el scroll.
- **Búsqueda global (Cmd+K)** de lecciones, conceptos y símbolos, con un índice generado en build.
- **Notas y marcadores por lección** en SQLite, con una página "Mis notas" exportable a Markdown.
- **Página de estadísticas**: acierto por asignatura, tiempo, racha, lecciones débiles y previsión de repasos.
- **Página de ajustes**, porque hoy solo existe el panel de actualizaciones en el Dashboard:
  - idioma, tema, tamaño de letra, objetivo diario;
  - **exportar e importar progreso** (copia en JSON) y reiniciar. Es importante porque los datos solo viven en un fichero local.
- **Accesibilidad**:
  - `:focus-visible` y `prefers-reduced-motion` ya existen; falta poder escalar la fuente;
  - el feedback de los ejercicios no usa `aria-live`;
  - atajos de teclado (Enter para comprobar, N para la siguiente lección).
- **Exportar a PDF** una lección o una chuleta por asignatura (`printToPDF`, offline).
- La tarjeta "Continuar" debería llevar a la **última actividad** y no a la primera asignatura empezada en orden.

---

## Fase 5: ingeniería (hacer antes o a la vez que la Fase 1)

1. **Tests**:
   - Vitest para `validate.js` (equivalencias, conjuntos, texto, forma), `plan.js` (fechas y cambios de hora) y `notation.js`.
   - Un *smoke test* con Playwright `_electron`: abrir lección → resolver → reiniciar → sigue resuelto. Habría detectado el fallo 0.2.
2. **CI en cada PR** (Ubuntu): `verify` + tests + `build`. Añadir Linux al release, ya que el README lo promete.
3. **Migraciones de la BD** con `PRAGMA user_version` e índices en `attempts(lesson_id)` y `attempts(exercise_id)`. Es un requisito previo de las tablas de la Fase 1.
4. **JSON Schema de lecciones** validado con `ajv` en `verify`, más `$schema` para tener autocompletado al escribir contenido.
5. ESLint (con `react-hooks`) + Prettier.
6. Medir el arranque: las 241 lecciones se importan de golpe (`import.meta.glob` con `eager`). Cargar el contenido por asignatura con `import()` dinámico si se nota.
7. Firma de código en Windows, para quitar el aviso de SmartScreen.
8. **Instalador más ligero** (comprobado en `/Applications/MathPath.app`): incluye 75 MB de `node_modules`. Gran parte ya va dentro de `out/renderer`: mathjs (16 MB), pyodide (13 MB), react-dom, katex, function-plot, d3… Pasar a `devDependencies` todo lo que solo usa el renderer o los scripts. En `dependencies` solo deben quedar `better-sqlite3` y `electron-updater`.

---

## Hoja de ruta propuesta

La numeración sigue la de `docs/project.html`, donde el último hito terminado antes de este plan era M26 (navegación y UX). La primera versión de este documento empezaba en M26, por error.

| Hito | Contenido | Esfuerzo | Estado |
|---|---|---|---|
| **M27** | Fase 0 (0.1–0.8) + CI de release con `verify` | S | ✅ Publicado en v0.1.5 |
| **M28** | FSRS + "Repaso de hoy" + dominio automático (1.1, 1.2) + migraciones de BD (5.3) + primeros tests (5.1) | M | ✅ Publicado en v0.2.0; días locales y aciertos a la primera en v0.2.2 |
| **M29** | Ejercicios: vista previa, feedback, `requireForm`, texto tolerante (2.1–2.4) + CI en PRs (5.2) | M | Siguiente |
| **M30** | Grafo de prerrequisitos + mapa + test de nivel + plan global (1.3, 1.5, 1.6) | M–L | ✅ Publicado en v0.2.0; cierre en v0.2.1; crédito implícito en v0.2.2 |
| **M31** | Ejercicios parametrizados (1.4) + examen por asignatura (3.5) | M | ✅ Publicado en v0.2.0; 10 plantillas más en v0.2.1 |
| **M32** | Asignatura nueva: Cálculo multivariable y optimización (3.1) | L | — |
| **M33** | Visualizaciones interactivas (3.3) + ejercicios de código de IA (3.4) | L | — |
| **M34** | Navegación, búsqueda, notas, estadísticas, ajustes y copia de seguridad (Fase 4) | M | — |
| continuo | Profundidad del contenido (3.2), lint ES (3.6), comprobación paso a paso (2.6), instalador ligero (5.8) | — | — |

## Ideas que necesitan una decisión tuya

- **Tutor con un LLM local** (Ollama o WebLLM, opt-in): explicaría errores y generaría pistas. Va contra el espíritu de CLAUDE.md ("ninguna dependencia de red en runtime") salvo que sea **estrictamente local y opcional**. Hoy no lo recomiendo: el repaso espaciado y el feedback por errores comunes cubren gran parte del valor sin ese riesgo.
- **Paquetes de contenido instalables** (asignaturas nuevas sin publicar versión): rompe el gate de verificación en build, salvo que los paquetes se firmen y verifiquen.

## Fuentes consultadas

- Math Academy: [How our AI works](https://mathacademy.com/how-our-ai-works) · [Skycak, *Individualized spaced repetition in hierarchical knowledge structures*](https://justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)
- FSRS: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) · [documentación](https://open-spaced-repetition.github.io/ts-fsrs)
- MathLive: [cortexjs.io/mathlive](https://cortexjs.io/mathlive)
