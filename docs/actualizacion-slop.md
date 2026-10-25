# Actualización de Slop New York

Referencia fijada: `09361be1fe6a2efaee6ef62420a664c677e577b9`. Three.js 0.186.1 y Vite se conservan. Rama de trabajo: `pruebas-slop-actualizacion`; no implica integración ni publicación.

## Inventario inicial

| Sistema | Estado antes de esta entrega | Diferencia comprobada |
|---|---|---|
| WebGPU / TSL / MRT / SSR / bloom | Implementado; pruebas de lógica | Falta matriz visual y medición de GPU |
| Cielo y sombras | Adaptado | Control horario visual separado del reloj |
| Preparación | Adaptación parcial | Calienta tres calidades y dos cámaras antes de jugar |
| Carros agrupados | Adaptación parcial | Solo sedán/taxi habilitados; SUV ya tiene geometría |
| Tráfico IDM y choques | Adaptación parcial | Cruces siguen ligados a semáforos |
| Motores | Pendiente | Grabaciones Howler frente a síntesis del donante |
| Fachadas | Adaptación parcial | Texturas Canvas y microtextura TSL; no equivalen al sistema procedural completo |
| Personajes | Adaptación propia necesaria | Ropa modular, esqueleto y animaciones conservados |
| Cannon / Howler / Lucide | En uso | Ragdoll, voces/radio e interfaz; no son código obsoleto |
| Bicicleta / helicóptero / mapa NY | No aplicable | Fuera del alcance acordado |

## Medición reproducible

Ejecutar producción con `npm run build` y `npm run preview -- --port 5190`. Después `node tools/benchmark.mjs`. Requiere Edge y WebGPU operativo. Tres contextos independientes, una navegación inicial y una recarga por contexto; semilla 44117, 1280×720, DPR 1, calidad alta. La primera navegación incluye creador si no existe guardado; el tiempo interno de carga se registra aparte del tiempo de navegación. Los resultados se guardan fuera del repositorio mediante `BENCH_REPORT`.

La caché GPU del controlador puede persistir entre contextos: «cold» significa caché HTTP del contexto nueva, no purga de caché del controlador. Los intervalos RAF y memoria registrada no son tiempos GPU ni memoria total del proceso. No comparar ejecuciones mientras se compila o se ejecuta la suite en paralelo.
