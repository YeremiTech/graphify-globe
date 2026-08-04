# Importación de grafos grandes

## 1. Limitación exacta del formato `GRAPHIFY.json` actual

El formato tradicional es un **JSON monolítico** flexible:

| Aspecto | Realidad |
|---|---|
| Estructura raíz | Objeto o arreglo |
| Nodos | `nodes`, o alias (`graph.nodes`, `data.nodes`, `vertices`, `entities`, …) o ítems de un arreglo raíz |
| Relaciones | `edges` / `links` / `relationships` / … |
| Orden de campos | **No garantizado** |
| Lectura progresiva de arrays | **No segura** con el contrato actual |
| Dependencias | Las aristas necesitan el conjunto de IDs de nodos; los duplicados requieren ver toda la colección |
| Parsers streaming | Solo serían seguros con un contrato estricto (p. ej. únicamente `nodes` luego `edges`, nodos primero). **Ese no es el contrato actual.** |

### Qué NO es streaming

```js
const text = await file.text(); // o acumular Blob.stream() en un string
const data = JSON.parse(text);
```

Aunque se lea con `Blob.stream()` y se muestre progreso por bytes, **si el texto completo se concatena y se hace `JSON.parse`, el documento entero está en memoria**. Graphify Globe **no afirma** parsing incremental para `.json` tradicional.

Pico orientativo (no medido en producción): **≈ 3.5–6× el tamaño del archivo** (Blob + string UTF-16 + objeto parseado + índice).

---

## 2. Solución implementada

### A) JSON tradicional (pequeño / mediano)

1. Detección de tamaño antes de parsear.
2. Límites según perfil de dispositivo (`deviceMemory`, `saveData`, techos absolutos).
3. **Confirmación** cuando el archivo supera el umbral suave.
4. **Rechazo** por encima del techo duro del perfil.
5. Lectura con progreso **honesto** (“JSON completo… sin streaming de parse”).
6. Cancelación por jobId en el worker.
7. Manejo de presión de memoria (`RangeError` / OOM) con mensaje accionable.
8. Recomendación de convertir a `.jsonl` o reducir el grafo.

### B) Graphify Globe Lines (`.jsonl`) — ruta alternativa real

- Un JSON por línea: `{"type":"node",...}` / `{"type":"edge",...}`.
- Lectura con `Blob.stream()` + `TextDecoder({ stream: true })` (UTF-8 multibyte).
- Parse línea a línea; liberación del texto de chunks ya consumidos.
- Lotes + `setTimeout(0)` (backpressure cooperativa).
- Rechazo de líneas enormes / archivo sin saltos (posible JSON renombrado).
- Detección de JSON truncado al final.
- Mismos campos de nodo/arista que GRAPHIFY; entra al mismo validador/índice/jerarquía.

### C) Manifiesto fragmentado (documentado, no importado inline)

Ver esquema `graphify-globe-bundle` en código (`BUNDLE_MANIFEST_SCHEMA`). Pensado para preprocesadores que emiten varios `.jsonl` por módulo; esta build importa **un archivo** (`.json` o `.jsonl`).

---

## 3. Compatibilidad

| Entrada | Soporte |
|---|---|
| `graph.json` / `GRAPHIFY.json` | Sí (completo en memoria) |
| Alias de estructura Graphify existentes | Sí |
| `.jsonl` / `.ndjson` | Sí (progresivo por líneas) |
| Manifiesto multi-archivo | Documentado; rechazado en UI con instrucción de conversión |
| Vista / LOD / jerarquía | Igual tras indexar |

Proyectos pequeños y medianos deben seguir usando GRAPHIFY.json.

---

## 4. Consumo esperado de memoria

| Formato | Durante lectura | Tras indexar |
|---|---|---|
| JSON tradicional | Archivo + **string completo** + parse | Índice + jerarquía + vista |
| JSONL | Chunks + arrays crecientes (sin string monolítico) | Índice + jerarquía + vista |

En ambos casos el **índice completo vive en el worker**. JSONL reduce el pico del parse, no elimina la RAM del grafo indexado.

Techos absolutos de esta build (conservadores):

- JSON tradicional: hasta **64 MB** (según dispositivo, a menudo menos).
- JSONL: hasta **96 MB** (según dispositivo, a menudo menos).

**No se declara soporte para tamaños no probados.** Las pruebas automatizadas usan fixtures pequeños y el sample de `examples/`.

---

## 5. Riesgos

- JSON grande + poca RAM → pestaña terminada por el SO sin `catch` fiable.
- JSONL mal formado (una sola línea gigante) → rechazado por backpressure de buffer.
- Confirmar un JSON enorme puede igual congelar el hilo del worker durante `JSON.parse`.
- El índice tipado crece con nodos/aristas aunque la vista esté limitada por calidad.

---

## 6. Procedimiento de migración

### GRAPHIFY.json → `.jsonl`

Cada nodo/arista del documento canónico:

```text
{"type":"node","id":"...","label":"...","type":"class",...}
{"type":"edge","source":"...","target":"...","relation":"..."}
```

Utilidad en código: `traditionalToJsonlText(doc)` (`src/lib/graphifyJsonl.js`).

Ejemplo listo: `examples/graph.sample.jsonl`.

### Hacia bundle fragmentado

1. Partir por módulo/paquete en varios `*.nodes.jsonl` / `*.edges.jsonl`.
2. Escribir un manifiesto `graphify-globe-bundle`.
3. Fusionar a un único `.jsonl` para esta versión del visor, o esperar soporte multi-archivo.

---

## 7. Pruebas realizadas

- Unitarias: evaluación de límites, detección de formato, ingest JSONL (líneas, truncado, clasificación).
- Regresión: validación / índice / jerarquía / LOD existentes.
- `npm run lint`, `npm test`, `npm run build`.

No se han certificado imports de decenas de MB en dispositivos reales en CI.
