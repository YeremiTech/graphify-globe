# Política para reportar errores

## Bugs de producto (no seguridad)

Abre un **GitHub Issue** en el repositorio con:

1. **Qué esperabas** vs **qué ocurrió**.
2. Navegador y SO (p. ej. Chrome 131 / Windows 11).
3. Tamaño aproximado del grafo (nodos/relaciones) y formato (`.json` / `.jsonl`).
4. Perfil de calidad usado (ligero / equilibrado / detallado / automático).
5. Pasos para reproducir.
6. Mensaje de error de la UI o de la consola (sin pegar el grafo completo si contiene datos sensibles).
7. Si aplica: resultado de `npm run bench:suite` en tu máquina (host + matriz).

No adjuntes archivos propietarios sin permiso. Usa `examples/graph.sample.json` o un recorte sintético.

## Seguridad / privacidad

Graphify Globe está pensado para **procesamiento local**. Si descubres:

- exfiltración de datos del grafo,
- ejecución remota no intencionada,
- o cualquier fuga hacia un servidor,

**no** abras un issue público con el exploit. Contacta al mantenedor del repositorio (dueño de GitHub: perfil del proyecto) por canal privado y describe el impacto sin PoC destructiva.

## Qué no es un bug

- OOM o pestaña colgada con JSON monolíticos muy grandes → límite conocido; prueba `.jsonl` o reduce el grafo ([IMPORT_LARGE_FILES.md](IMPORT_LARGE_FILES.md)).
- FPS bajos en equipos modestos con perfil “detallado” → usa “ligero” / “automático”.
- Nodos no dibujados individualmente cuando hay agrupación/LOD → esperado; la búsqueda sigue indexando el conjunto completo.
