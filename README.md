# Graphify Globe

Visualizador **local** de grafos Graphify sobre un globo 3D (React, Vite, Three.js). Cargas `graph.json` / `GRAPHIFY.json` o `.jsonl`; el análisis corre en un Web Worker en tu navegador.

![Vista previa](docs/preview.png)

**Demo:** https://yeremitech.github.io/graphify-globe/

## Descripción

La app arranca vacía. Importas un archivo (selector o drag-and-drop) y se indexa el grafo completo en el worker. La escena 3D muestra una **vista** (posible agrupación + LOD), no necesariamente un punto por cada nodo indexado. La búsqueda opera sobre el **índice completo**, incluidos nodos no dibujados.

## Arquitectura

```text
UI (React)
  ├─ ImportPanel / GraphSearch / NodeInfoPanel / HierarchyBreadcrumb
  ├─ GlobeScene (Three.js: InstancedMesh, LOD, dispose)
  └─ useGraphSession ──postMessage──► graphWorker
                                         ├─ validación + índice tipado
                                         ├─ jerarquía / vista
                                         └─ búsqueda progresiva
```

- **Índice:** todos los nodos/aristas válidos (en el worker).
- **Vista:** entidades mostrables tras jerarquía/límites de calidad.
- **Escena:** subconjunto GPU tras LOD / perfil (contador en UI: “Escena”).

Documentación relacionada: [IMPORT_LARGE_FILES.md](docs/IMPORT_LARGE_FILES.md), [JSONL_FORMAT.md](docs/JSONL_FORMAT.md), [BENCHMARKS.md](docs/BENCHMARKS.md), [A11Y_RESPONSIVE.md](docs/A11Y_RESPONSIVE.md).

## Instalación

Requisitos: **Node.js ≥ 20.19** (CI usa 22), npm 10+.

```bash
npm ci
```

En Windows también puedes usar `INICIAR-WINDOWS.bat` tras instalar dependencias.

## Desarrollo

```bash
npm run dev
```

Abre la URL de Vite (habitualmente `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

Salida en `dist/`.

Para GitHub Pages el workflow fija `GITHUB_PAGES_BASE=/graphify-globe/`. En local el `base` por defecto es `./`.

## Pruebas

```bash
npm run lint
npm test
```

CI ejecuta `npm ci` → `lint` → `test` → `build` y **solo entonces** despliega Pages en `main`.

## Formato `GRAPHIFY.json`

Objeto (o arreglo) con nodos y relaciones. Rutas habituales: `nodes` + `edges` (también alias como `links`, `graph.nodes`, etc.). El orden de claves **no** está garantizado → **no** hay parse incremental seguro del JSON monolítico.

Campos típicos de nodo: `id`, `label`, `type` / `node_type`, `source_file`, `source_location`, metadatos/tags.  
Aristas: `source`, `target`, `relation`, `confidence`.

### Ejemplo mínimo

```json
{
  "nodes": [
    { "id": "a", "label": "A", "type": "class" },
    { "id": "b", "label": "B", "type": "class" }
  ],
  "edges": [
    { "source": "a", "target": "b", "relation": "calls", "confidence": "EXTRACTED" }
  ]
}
```

Más ejemplos: `examples/graph.sample.json`, `examples/graph.sample.jsonl`.

## Procesamiento local y privacidad

- El archivo **no se sube** a un servidor de la aplicación.
- Parse, índice, búsqueda y escena ocurren en el cliente (worker + main thread).
- No hay telemetría de grafo en este proyecto.

## Límites de archivo

- Techos por perfil de dispositivo + confirmación en archivos grandes.
- JSON tradicional: techo absoluto conservador **64 MiB** (no garantiza éxito bajo ese tamaño).
- JSONL: techo **96 MiB**; reduce el pico de parse, no el tamaño del índice.
- Detalle: [docs/IMPORT_LARGE_FILES.md](docs/IMPORT_LARGE_FILES.md).

## Indexado vs renderizado

| Capa | Significado |
| --- | --- |
| Proyecto (encontrados) | Nodos/rels detectados en el archivo |
| Indexados | Válidos retenidos en el worker |
| Vista | Entidades de la vista lógica (hojas y/o grupos) |
| Agrupados | Indexados no expuestos como hoja en la vista actual |
| Escena | Nodos realmente dibujados tras LOD |

`stats.renderedNodes` es un **alias histórico de la vista**, no el recuento GPU. El recuento de escena aparece como “Escena” junto al LOD.

## Agrupamiento

Grafos medianos/grandes usan jerarquía (módulos/paquetes). Puedes expandir grupos, subir de nivel y usar la migas de pan. Expandir cambia la vista; el índice no se recalcula desde cero.

## Niveles de detalle (LOD) y perfiles de calidad

Perfiles UI: **Ligero**, **Equilibrado**, **Detallado**, **Automático**.

Afectan límites de vista, densidades de escena y adaptación por FPS (automático). Simplificar la escena **no** significa que el archivo “esté incompleto”: el índice y la búsqueda siguen siendo globales.

## Búsqueda global

Combobox en el panel: ID, nombre, ruta, tipo, módulo, etiquetas, etc. Resultados incluyen nodos fuera de vista; al elegir uno se revelan grupos padres cuando hace falta. Cancelable; respeta teclado y anuncios `aria-live`.

## Benchmarks

Guía reproducible: [docs/BENCHMARKS.md](docs/BENCHMARKS.md).

```bash
npm run bench:generate -- --nodes 5000 --density medium
npm run bench:suite          # smoke: 1k + 5k
npm run bench:suite:full     # ladder amplio (puede agotar RAM)
npm run bench:browser        # FPS / import en navegador
```

**No declares soporte para tamaños no medidos en tu host.**

### Resultados medidos en este repositorio (suite Node, smoke)

Host de referencia del artefacto local: win32/x64 · Node v22.23.2 · ~20 GB RAM · 8 CPUs (2026-08-04):

| Nodos | Relaciones | Formato | Resultado en ese host |
| ---: | ---: | --- | --- |
| 1 000 | 3 000 | json | Completó (categoría automática: Soportado) |
| 5 000 | 15 000 | json | Completó (categoría automática: Soportado) |

Tamaños 10k–500k del ladder: **no medidos** en la suite versionada (plantilla “No medido”). Repite `bench:suite:full` en tu máquina antes de afirmar soporte.

## Navegadores soportados

Objetivo: navegadores **evergreen** recientes con WebGL2 / Web Workers / ES2022:

- Chrome / Edge (últimas 2 versiones mayores)
- Firefox (últimas 2)
- Safari 16.4+ (donde WebGL y workers módulo estén disponibles)

No se certifican Internet Explorer ni navegadores sin WebGL.

## Limitaciones conocidas

- `JSON.parse` de GRAPHIFY monolítico no es cancelable a mitad del parse nativo.
- Selección puntual en el canvas 3D es por puntero; teclado rota/zoom y la vía principal de nodos es búsqueda + panel.
- JSONL no elimina la RAM del índice completo.
- FPS y tiempos dependen del hardware; la suite Node **no** mide FPS.
- Accesibilidad: aproximación WCAG 2.2 AA en UI; el canvas no se audita como texto.

## Despliegue

1. En GitHub → Settings → Pages → Source: **GitHub Actions**.
2. Push a `main` con CI en verde.
3. Workflow [`.github/workflows/ci-pages.yml`](.github/workflows/ci-pages.yml): lint → test → build (`base` `/graphify-globe/`) → artifact → `deploy-pages`.
4. Los PR ejecutan lint/test/build **sin** desplegar.

## Contribuir y errores

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/SECURITY_AND_BUGS.md](docs/SECURITY_AND_BUGS.md)
