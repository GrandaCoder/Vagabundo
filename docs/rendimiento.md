# Rendimiento y medición

La rama `mejora-rendimiento` reduce trabajo de renderizado y consultas de simulación conservando el mapa, las partidas guardadas, los cruces y las colisiones por altura. La referencia de partida es el commit `3abc15a8fae36ba3f479296ff101128c2fcd7429`.

## Cambios

- Las casas que reutilizan una variante de fachada comparten el material base. Las paredes que se atenúan conservan materiales independientes; los lotes cerrados usan sus propios materiales compartidos, para que una pared transparente no afecte a otras casas. Las luces nocturnas actualizan ambos conjuntos.
- Cámara y movimiento consultan una cuadrícula espacial de 16 metros. Las cajas extensas se registran en todas las celdas que ocupan, se deduplican y conservan el orden de resolución anterior. Permanecen las pruebas precisas AABB/OBB, el barrido y los colliders `layered`.
- El tráfico indexa personas y vehículos una vez por subpaso y separa vehículos por ruta. Las consultas cubren la distancia de frenado y el tamaño del otro vehículo; no se suspende tráfico por estar fuera de cámara.
- Los peatones a más de 40 metros dejan de actualizar su pose, aunque sigan caminando. Los cercanos y medios tienen una frecuencia visual según el perfil gráfico. Navegación, reacciones y movimiento continúan.
- Las acciones de animación con un peso residual inferior a 0,001 se desactivan. Cambiar apariencia o retirar un NPC libera materiales, esqueletos y geometrías propios, también si una carga asíncrona llega después de retirar al personaje. Los recursos del banco siguen compartidos. La geometría de cuerpo que se recorta bajo ropa tiene buffers propios para poder liberarlos sin dañar otra instancia.
- Las luces se descubren al registrar una rama, sin recorrer toda la ciudad cada segundo. Sus posiciones estáticas se fijan después de cargar modelos; intensidad y visibilidad siguen actualizándose. El fogón ya está registrado antes de construirlo y se activa mediante visibilidad. Se mantienen dos proxies de luz y los halos instanciados.
- Faroles, aros de robo de los carros estacionados, bolsas, contenedores y sus aros se dibujan en lotes instanciados (`InstancedChunks`, `VehicleBatches` e `InstanceBatches`). Cada objeto conserva su `visible` como estado del juego (recogida, reaparición, robo, enfriamiento); el lote de recogibles se arma después del descarte por frustum. El aro de potenciador no se dibuja mientras su opacidad es 0.
- La silueta conserva sus dos pasadas correctivas, pero se omite en calidad baja y cuando los volúmenes de colisión no indican obstrucción del jugador. La lista de luces de esas pasadas es explícita y no necesita recorrer la ciudad.
- La primera partida empieza en calidad baja. La adaptación baja resolución con mayor rapidez ante carga severa y, al alcanzar el mínimo, puede reducir sombras, silueta, distancia de cámara y frecuencia visual de animación. No sobrepasa el perfil elegido por el jugador ni cambia la simulación.

El recorte isométrico conserva sus paredes individuales. Esta entrega no reexporta esqueletos reducidos ni introduce un sistema nuevo de LOD geométrico para edificios. Son pasos posteriores que necesitan medición y revisión visual de los recursos.

En una comparación estructural con la misma ciudad de 511 edificios y 1.372 colliders, los materiales de los lotes cerrados pasaron de 903 a 345 y sus mallas de 908 a 890. Una consulta de cámara en la zona inicial pasó de revisar 1.372 cajas a obtener siete candidatas. Para esta comparación se usó geometría real y se sustituyeron Canvas y carga de personajes; el azar de generación se mantuvo separado del de UUID para conservar la escena. Son recuentos de trabajo, no una medición de FPS ni de GPU.

## Estadísticas recientes

El mínimo y máximo del HUD siguen siendo históricos desde el último reinicio. Los nuevos percentiles usan un anillo de los últimos 600 cuadros activos, no una ventana temporal fija. `p95` y `p99` son percentiles de duración de cuadro con rango más próximo; valores menores son mejores. El 1 % bajo se obtiene como `1000 / media de duración del 1 % de cuadros más lentos`, redondeando hacia arriba la cantidad de cuadros. Los tirones cuentan duraciones superiores a 100 ms dentro del mismo anillo.

## Perfil de CPU

Desde la consola del navegador, después de entrar a jugar:

```js
const game = window.__game;
game.profiler.reset();
game.performanceHUD.metrics.reset();
game.profiler.enabled = true;
```

Recorrer la misma zona durante 30–60 segundos y luego obtener los datos:

```js
game.profiler.enabled = false;
JSON.stringify(game.getPerformanceReport(), null, 2);
```

El perfilador almacena hasta 1.800 cuadros en memoria y separa jugador/cámara/colisiones, sistemas, mundo/NPC, tráfico, entidades/clima/audio, envío de render/luces/culling e interfaz. Devuelve p50/p95/p99 en milisegundos. Está desactivado por defecto, no escribe por cuadro en consola y no envía datos a ningún servicio.

El tiempo alrededor del render es CPU y envío de órdenes: **no mide el tiempo GPU**. Para GPU usar una captura del navegador o consultas temporales asíncronas válidas. Comparar con la misma resolución, cámara, calidad, escena y DPR fijo. Un navegador con renderizado por software sirve para comprobar flujos, no para estimar FPS del equipo del jugador.

## Mantenimiento

- Las cajas estáticas se indexan de nuevo al sustituir su array o cambiar su longitud. Tras mover o modificar una caja ya registrada, llamar a `collisions.invalidateStaticIndex()`.
- Al añadir luces dentro de una rama existente, llamar a `localLights.register(rama)`. Tras mover fuentes marcadas como estáticas, usar `localLights.refreshSources({ static: true })` después de terminar los cambios. Añadir o retirar raíces directamente de la escena ya registra o retira sus luces.
- Mantener los materiales de lotes cerrados separados de los clones que cambian de opacidad. No liberar geometrías o texturas compartidas al destruir un personaje.
- Validar con `npm test`, `npm run build` y `npm run test:e2e`. Las pruebas de regresión comparan el barrido indexado con una consulta exhaustiva e incluyen límites de celdas, cajas extensas, limpieza de recursos, recuperación de calidad y estadísticas acotadas.

## Validación de esta entrega

`npm test` completó correctamente los 47 archivos de pruebas y `npm run build` terminó sin errores. Las pruebas de navegador se intentaron con Chromium y renderizado por software: una ejecución llegó a la partida, pero los recorridos completos encontraron tiempos agotados y cierres de pestaña durante la preparación gráfica. No se consideran una suite E2E aprobada ni una medición de FPS en GPU real. Se corrigió una expectativa antigua de la nota inicial que exigía créditos actualmente ocultos, manteniendo intacta esa nota.

## Línea base de la ciudad sola (rama cambio-de-prueba-de-ciudad)

Medida con `?perf` en X 209.48, Z 38.65 (tercera persona, mediodía, calidad baja bloqueada, panel DEV con carros, TransMilenio, peatones, palomas, Chato, árboles, lluvia, luces, sombras y efectos apagados). El tiempo es el de CPU de `Renderer.render` (mediana de las llamadas del bucle del juego), que no depende de la velocidad del panel integrado.

| Qué se oculta | Dibujos | CPU de render |
| --- | --- | --- |
| nada | 1018 | 19,9 ms |
| `Edificios agrupados en tercera persona` | 701 | 15,3 ms |
| todos los `Sector x,z` estáticos | 157 | 7,4 ms |

- Cada dibujo cuesta 14–20 µs de CPU; con ~1000 dibujos el cuadro supera los 30 ms sin que los triángulos (≈400 mil, la mayoría en objetos sueltos y semáforos) ni los píxeles sean el límite.
- Los sectores estáticos suman ~550 dibujos con 146 materiales distintos y mallas diminutas (media de 20–60 triángulos): la fusión por material × chunk de 32 m produce muchos dibujos pequeños. Las calzadas, andenes y bordillos suman ~90; la vista cerrada de edificios, ~320 en tres decenas de variantes de fachada.

**Chunks estáticos de 96 m (antes 32 m).** En el mismo punto: 1018 → 706 dibujos y 19,9 → 15,1 ms de CPU de render. El corte por frustum sigue por chunk y las sombras usan proxies propios, así que solo se dibujan algo más de triángulos por chunk parcialmente visible.

**Color por vértice y mallas sin UV en la fusión estática.** Los materiales lisos (sin mapas, emisión ni transparencia) que solo difieren en el tono se dibujan con un material portador por acabado y el color viaja en un atributo por vértice (`VertexColorCarriers`, adaptado de la idea de Slop New York de que el color sea dato y no programa); 22 portadores sustituyen decenas de materiales. Las mallas lisas sin UV (el tablero del puente) ahora entran en la fusión. Mismo punto: 706 → 631 dibujos, 15,1 → 14,6 ms de CPU de render. Queda la vista cerrada de edificios (~240 dibujos) y los objetos sueltos.

**Vista cerrada de edificios con materiales unificados.** `buildClosedView` creaba un material por pared y chunk; ahora usa el mismo `MaterialDeduper` y los portadores de color por vértice. Mismo punto: 631 → 554 dibujos, 14,6 → 13,4 ms de CPU de render (de 1018 y 19,9 ms al inicio de la rama).

**Fachadas de casas con un solo material procedural (`src/graphics/CityFacade.js`).** Las casas usaban una textura de lienzo (color, emisión y relieve) por combinación de ancho, pisos, estilo y variante, y cada una era un material y un dibujo por chunk. Ahora todas comparten un material TSL cuya variación (ancho, pisos, estilo ladrillo/pintada/ruina, semilla y tono) va en los atributos de vértice `facadeParams` y `facadeTone`: ventanas con marco, rejas, cortinas y tablas, persianas metálicas con grafiti en la planta baja y ventanas encendidas por la noche con `cityUniforms.lightsOn`. La fusión estática y la vista cerrada conservan esos atributos (`userData.vertexAttributes`) y el corte isométrico usa copias que comparten el grafo con `alphaHash`. Mismo punto: 554 → 407 dibujos, 13,4 → 11,6 ms de CPU de render; las texturas únicas bajan de 443 a 262. La adaptación no usa cajas unitarias instanciadas: la geometría de cada casa sigue fusionada por chunk, que cuesta los mismos dibujos.
