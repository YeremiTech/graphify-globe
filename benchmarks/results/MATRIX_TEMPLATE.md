# Matriz de límites — plantilla

> **Estado:** no medido en este repositorio de forma certificada.  
> Sustituye las celdas solo con salidas de `npm run bench:suite` / `bench:suite:full` / harness de navegador en un host identificado.

Host: _…_ · Fecha: _…_ · Node: _…_ · Navegador(es): _…_

| Categoría | Nodos | Relaciones | densitiy | Lectura | Parse | Validación | Indexación | 1ª vista | Nodos vista | Rel. vista | Búsqueda | FPS movimiento | Resultado |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Pequeño | 1,000 | ~3,000 | medium | — | — | — | — | — | — | — | — | — | No medido |
| Pequeño | 5,000 | ~15,000 | medium | — | — | — | — | — | — | — | — | — | No medido |
| Pequeño | 10,000 | ~30,000 | medium | — | — | — | — | — | — | — | — | — | No medido |
| Mediano | 50,000 | ~150,000 | medium | — | — | — | — | — | — | — | — | — | No medido |
| Mediano | 50,000 | ~40,000 | sparse | — | — | — | — | — | — | — | — | — | No medido |
| Mediano | 50,000 | ~400,000 | dense | — | — | — | — | — | — | — | — | — | No medido |
| Grande | 100,000 | ~300,000 | medium | — | — | — | — | — | — | — | — | — | No medido |
| Grande | 250,000 | ~750,000 | medium | — | — | — | — | — | — | — | — | — | No medido |
| Masivo | 500,000 | ~1,500,000 | medium | — | — | — | — | — | — | — | — | — | No medido |

## Leyenda de resultado

- **Soportado**
- **Soportado con degradación**
- **Experimental**
- **No soportado**
- **No medido** ← valor por defecto hasta reproducir

## Notas al completar

- Si un caso lanza OOM / cierra pestaña: pon **No soportado** y pega el mensaje de error.
- JSON tradicional vs JSONL: anota el formato en una columna extra o en notas.
- No copies números de otro equipo sin repetir el bench.
