# Formato escalable alternativo: Graphify Globe Lines (`.jsonl`)

Complemento a `GRAPHIFY.json` cuando el documento monolítico deja de ser viable. Detalle de límites e importación: [IMPORT_LARGE_FILES.md](IMPORT_LARGE_FILES.md).

## Por qué existe

El JSON tradicional de Graphify es **multi-ruta y agnóstico al orden** de claves. Por eso **no** hay un parse incremental seguro del archivo completo. JSONL permite **lectura por líneas** con `Blob.stream()` sin acumular un único string del documento.

## Contrato

- Extensión: `.jsonl` o `.ndjson`.
- Una línea = un objeto JSON.
- Tipos soportados:

```json
{"type":"node","id":"a","label":"A","node_type":"class","source_file":"a.java"}
{"type":"edge","source":"a","target":"b","relation":"calls","confidence":"EXTRACTED"}
```

Alias de campos alineados con GRAPHIFY (`node_type` / `type`, `source_file`, etc.).

## Qué reduce y qué no

| Fase | JSONL |
| --- | --- |
| Lectura / parse | Progresiva por líneas (sin string monolítico) |
| Índice en el worker | Completo en memoria (igual que JSON tras indexar) |
| Vista / LOD / jerarquía | Igual pipeline |

JSONL **no** convierte el navegador en un almacén ilimitado: el índice sigue creciendo con nodos y aristas.

## Ejemplo mínimo

Ver `examples/graph.sample.jsonl`.

## Manifiesto multi-archivo

Existe un esquema documentado `graphify-globe-bundle` en código para preprocesadores que emiten varios `.jsonl`. **Esta build importa un solo archivo** (`.json` o `.jsonl`); el manifiesto se rechaza en UI con instrucción de conversión.
