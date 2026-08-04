# Benchmarks reproducibles — Graphify Globe

## Objetivo

Medir límites **reales** del pipeline en un host concreto.  
**No declares soporte para un tamaño que no hayas ejecutado en ese host.**

Los archivos sintéticos grandes **no se versionan**: se generan por script y viven en `benchmarks/generated/` (gitignored).

---

## Generador de datos

```powershell
npm run bench:generate -- --nodes 5000 --density medium
npm run bench:generate -- --nodes 100000 --density hierarchical --format jsonl
npm run bench:generate -- --ladder --densities medium,sparse --format json
```

Densidades:

| densitiy | Relaciones aprox. | Notas |
| --- | ---: | --- |
| `sparse` | 0.8 × nodos | pocas relaciones |
| `medium` | 3 × nodos | densidad media |
| `dense` | 8 × nodos | muchas relaciones |
| `hierarchical` | 3.5 × nodos | módulos + más aristas cross-module |

Tamaños del ladder: 1k, 5k, 10k, 50k, 100k, 250k, 500k.

Esquema compatible con `GRAPHIFY.json` (`nodes` / `edges` + package/module/tags).

---

## Suite Node (pipeline)

Métricas: tamaño, lectura, parse, validación, indexación (+ normalización incluida), jerarquía, 1ª vista, nodos/rels renderizados, búsqueda, expansión, liberación, memoria heap/RSS, errores.

```powershell
# Smoke (por defecto): 1k + 5k, density medium — apto para CI/dev
npm run bench:suite

# Con GC explícito
npm run bench:suite:gc

# Ladder amplio (puede agotar RAM; no CI)
npm run bench:suite:full

# Personalizado
node benchmarks/run-suite.mjs --sizes 1000,5000,10000,50000 --densities sparse,medium,hierarchical --write-files
```

Salida:

- `benchmarks/results/suite-<timestamp>.json`
- `benchmarks/results/suite-<timestamp>.md` (matriz)

### Categorías honestas

| Categoría | Significado |
| --- | --- |
| Soportado | Completó con tiempos razonables en ese host |
| Soportado con degradación | Completó; agrupación/LOD necesarios o tiempos altos |
| Experimental | Completó al límite o inestable |
| No soportado | Error, OOM o no viable |

La clasificación automática es **heurística del runner**; la columna de fallos muestra el error real sin ocultarlo.

---

## Navegador (FPS + import)

```powershell
npm run bench:browser
```

Abre `/benchmarks/browser/index.html`, elige perfil (potente / medio / portátil / móvil) y un JSON generado. Exporta el JSON del reporte.

Repite en Chrome, Firefox y Safari (si está disponible). El runner Node **no** mide FPS.

---

## Matriz de referencia (plantilla)

Hasta que ejecutes la suite en tu máquina, la matriz oficial es **“No medido”**.  
Plantilla: [`benchmarks/results/MATRIX_TEMPLATE.md`](../benchmarks/results/MATRIX_TEMPLATE.md).

Tras un run, adjunta el `.md` generado o actualiza la plantilla con números **y el host**.

Ejemplo de forma (valores inventados — no usar como soporte):

| Categoría | Nodos | Relaciones | Importación | Indexación | Renderizado | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Pequeño | 5,000 | 15,000 | … | … | … | Soportado *(solo si lo mediste)* |
| Mediano | 50,000 | 150,000 | … | … | … | Soportado con degradación |
| Grande | 250,000 | 750,000 | … | … | … | Experimental / JSONL |
| Masivo | 500,000+ | … | … | … | … | No recomendado en JSON tradicional |

---

## Escenarios de dispositivo

Documenta en cada reporte:

- Escritorio potente / medio / portátil / móvil
- Navegador: Chrome / Firefox / Safari
- Node version + RAM del host (`suite-*.json` → `host`)

---

## Riesgos y honestidad

- 100k–500k en JSON monolítico pueden matar la pestaña o el proceso Node: **eso es un resultado válido (No soportado)**.
- Pico de memoria ≈ archivo + string + parse + índice; el runner reporta heap aproximado, no un profiler certificado.
- `normalizationMs` no está separado: va dentro de `indexingMs` (`buildIndexedGraph`).
- FPS solo en harness de navegador / app real.

---

## Pruebas del generador

```powershell
npm test -- benchmarks
```

(o el test unitario en `src/lib/__tests__/syntheticGraph.test.js` si se enlaza; ver `benchmarks/lib/__tests__` vía vitest include).
