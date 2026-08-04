# Entrega de producción — Graphify Globe v1.3

Documento de cierre. Solo afirma lo demostrable por tests/suite locales o CI.

## 1. Resumen ejecutivo

Graphify Globe es un visualizador client-side de grafos Graphify sobre un globo Three.js. Esta preparación final añade CI completo (lint/test/build) con deploy a GitHub Pages condicionado al éxito, documentación de producto/operación, y correcciones de ciclo de vida (cancelación de import, dispose de `InstancedMesh`, búsqueda al desmontar) sin nuevas funcionalidades de producto.

## 2. Arquitectura final

- **React 19** UI + **Vite 8** + **Three.js 0.185**
- **Web Worker** (`graphWorker.js`): validación, índice, jerarquía, vista, búsqueda
- **Main thread**: sesión (`useGraphSession`), escena (`GlobeScene` + LOD/progresivo), paneles
- Formatos: `GRAPHIFY.json` (completo en memoria) y `.jsonl` (lectura por líneas)
- Deploy: GitHub Actions → artifact `dist` → GitHub Pages (`/graphify-globe/`)

## 3. Archivos relevantes (esta fase)

| Área | Rutas |
| --- | --- |
| CI | `.github/workflows/ci-pages.yml` (reemplaza `deploy.yml`) |
| Base Pages | `vite.config.js` (`GITHUB_PAGES_BASE`) |
| Ciclo de vida | `src/workers/graphWorker.js`, `src/hooks/useGraphSession.js`, `src/lib/threeDispose.js`, `src/components/GraphSearch.jsx`, `src/App.jsx` |
| Docs | `README.md`, `CONTRIBUTING.md`, `docs/SECURITY_AND_BUGS.md`, `docs/JSONL_FORMAT.md`, `docs/BENCHMARKS.md`, `docs/IMPORT_LARGE_FILES.md`, este archivo |

## 4. Dependencias

**No se agregaron ni eliminaron dependencias npm** en esta fase. Stack: `react`, `react-dom`, `three`; dev: `vite`, `vitest`, `eslint` (+ plugins). Instalación reproducible vía `package-lock.json` + `npm ci`.

## 5. Pruebas ejecutadas

```text
npm run lint   → OK
npm test       → Vitest, suites en src/lib/__tests__/
npm run build  → Vite → dist/
```

(Ejecutar de nuevo tras los últimos cambios de lifecycle antes del merge.)

## 6. Resultados de benchmarks

Suite smoke Node (artefacto `benchmarks/results/suite-2026-08-04T11-33-34-522Z.md`):

- Host: win32/x64, Node v22.23.2, ~20 GB RAM, 8 CPUs
- 1 000 nodos / 3 000 rel. · json → completó
- 5 000 nodos / 15 000 rel. · json → completó
- Ladder 10k–500k: **no medido** en ese run

FPS multi-navegador: **no medidos** en CI (usar `npm run bench:browser` localmente).

## 7. Tamaños realmente soportados (demostrados)

En el host de la suite anterior, el pipeline Node completó **1k y 5k** (density medium, JSON).  
Cualquier otro tamaño permanece **No medido** hasta repetir la suite allí. No se afirma soporte genérico “mediano/grande/masivo”.

## 8. Limitaciones

- JSON monolítico: pico de memoria ≈ Blob + string + parse + índice; sin parse incremental.
- Cancelar no interrumpe `JSON.parse` nativo a mitad.
- La escena puede mostrar menos nodos que el índice (agrupación + LOD).
- Selección 3D por raycast (ratón); teclado complementa rotación/zoom.
- Pages requiere permisos `pages` + `id-token` solo en el job de deploy.

## 9. Riesgos pendientes

- OOM en hosts con poca RAM incluso bajo techos de archivo.
- Carreras residuales bajo cancelación agresiva durante JSONL muy largo (mitigadas; vigilar en QA).
- Chunk JS grande (~900 kB) por Three.js — aviso de Vite; code-split opcional a futuro.
- Safari / WebGL en dispositivos antiguos no certificados.
- Resultados de benchmark no transferibles entre máquinas.

## 10. Recomendaciones futuras

1. Medir ladder 10k–50k (y JSONL) en un host documentado; publicar matriz con host.
2. Harness de FPS en CI smoke opcional (headless) si se estabiliza.
3. Code-splitting de Three.js / worker para reducir TTI.
4. Pruebas e2e ligeras (Playwright) de import → búsqueda → expandir grupo.
5. Null explícito de TypedArrays en `releaseIndexedGraph` para caída de memoria más determinista.
