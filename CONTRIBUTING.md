# Contribuir a Graphify Globe

Gracias por ayudar a mejorar el visualizador. Este documento cubre el flujo mínimo para cambios seguros.

## Requisitos

- Node.js **20.19+** (CI usa **22**)
- npm 10+

## Arranque local

```bash
npm ci
npm run dev
```

Scripts útiles:

| Comando | Uso |
| --- | --- |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run build` | Build de producción |
| `npm run preview` | Servir `dist` |
| `npm run bench:suite` | Smoke de benchmarks (1k + 5k) |

## Principios

1. **Sin rediseño cosmético** salvo que el cambio corrija un bug concreto (a11y, overflow, fuga).
2. **Honestidad de escala**: no afirmar tamaños no medidos; actualizar `docs/BENCHMARKS.md` / resultados al medir.
3. **Privacidad**: el grafo se procesa en el navegador; no añadir telemetría ni subidas remotas.
4. **JSON tradicional ≠ streaming**: no “fingir” parse incremental de `GRAPHIFY.json`.
5. Preferir cambios pequeños y revisables.

## Flujo de PR

1. Rama desde `main`.
2. `npm ci && npm run lint && npm test && npm run build` en local.
3. Describe el *porqué* del cambio y cómo probarlo.
4. CI de GitHub Actions debe pasar (lint + test + build). El deploy a Pages solo corre en `main` tras un push exitoso.

## Estilo de código

- ES modules, React 19, Three.js 0.185.
- Sin Material UI / Bootstrap.
- Tests junto a `src/lib/__tests__/`.
- Evitar dependencias nuevas salvo necesidad clara (justificar en el PR).

## Benchmarks

Ver [docs/BENCHMARKS.md](docs/BENCHMARKS.md). No subas grafos sintéticos grandes (`benchmarks/generated/` está ignorado).

## Reportar errores

Ver [docs/SECURITY_AND_BUGS.md](docs/SECURITY_AND_BUGS.md).
