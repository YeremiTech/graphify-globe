# Accesibilidad y responsividad

Aproximación a WCAG 2.2 AA **sin rediseñar** la identidad visual de Graphify Globe.

## Qué se mantuvo

| Aspecto | Estado |
| --- | --- |
| Globo 3D (Three.js), LOD y selección visual | Intactos |
| Paleta verde oscuro / acentos cian-rosa-ámbar | Intacta (solo contraste de texto secundario) |
| Tipografía monoespaciada | Intacta |
| Animaciones principales (entrada de paneles, atmósfera) | Intactas; se respetan si `prefers-reduced-motion` |
| Distribución: topbar, panel lateral/inferior, resumen, status | Misma composición |
| Estilo de paneles, botones y controles | Mismos componentes; sin Material UI ni Bootstrap |

## Qué se corrigió

### Accesibilidad

| Problema | Corrección |
| --- | --- |
| Sin atajo al contenido principal | Skip link → `#import-panel` / `#explorer-panel` |
| Foco poco visible | `--focus-ring` global en controles interactivos |
| Iconos sin nombre / símbolos leídos por AT | `aria-label` + `aria-hidden` en glifos |
| “Importar otro” en móvil perdía su etiqueta (todos los tool-buttons → `+`) | Solo `.import-other` se compacta a `+`; “← Vista” conserva texto |
| Rotación sin estado | `aria-pressed` en play/pausa |
| Diálogo de archivo grande incompleto | `alertdialog` + `aria-modal` + `aria-describedby` + foco inicial + Escape |
| Progreso solo visual | `role="progressbar"` + `aria-valuenow` + live region |
| Errores sin anuncio | `role="alert"` / `status` |
| Búsqueda: resultados difíciles de alcanzar | Combobox, listbox, flechas, Home/End, Escape, `aria-live` |
| Conexiones: color como única pista | Texto de dirección + `aria-label` completo en cada botón |
| Leyendas: puntos decorativos | `aria-hidden` en indicadores de color |
| Panel / nodo seleccionado | `id`/`aria-labelledby` en título; lista de conexiones con roles |
| Globo solo con ratón | Foco en `.globe-host`; flechas / zoom / Escape; panel y búsqueda como vía principal de selección |
| `prefers-reduced-motion` | CSS: anima/transiciones mínimas; JS: sin auto-rotate por defecto, sin pulse/partículas/slerp largo |
| Tooltips solo hover | En ≤760px se ocultan; la info vive en el panel / status |

### Responsividad

| Viewport / caso | Corrección |
| --- | --- |
| Altura móvil (`100vh` recortado) | `--app-height` con `100dvh` + safe-area |
| ≤760px: import centrado con `translateY(-42%)` cortaba botones | Anclado bajo topbar + `max-height` + scroll |
| Landscape bajo | Panel import con scroll; explorador lateral en lugar de sheet inferior |
| ≤520px: tool-buttons ilegibles / wrong glyph | Compactación selectiva; restore compacto |
| Paneles superpuestos / status tapado | Status reposicionado sobre la altura del sheet |
| Overflow horizontal | Gutters con `min(…, 100vw - …)` y `overflow-x: hidden` en import |
| Texto secundario débil | `--muted` / `--muted-soft` unificados hacia contraste AA |

### Breakpoints verificados (criterio)

| Tamaño | Orientación | Expectativa |
| --- | --- | --- |
| 320 × 568 | vertical | Import usable con scroll; con grafo: sheet inferior + toolbar alcanzable |
| 375 × 667 | vertical | Igual, tipografía legible |
| 768 × 1024 | vertical / horizontal | Panel sheet o lateral según media landscape |
| 1366 × 768 | horizontal | Layout escritorio (panel izquierdo) |
| 1920 × 1080 | horizontal | Escritorio completo |

## Limitaciones conocidas (honestas)

- La selección **directa de un nodo concreto en el canvas 3D** sigue siendo por puntero (raycast). Teclado rota/zoom y limpia selección; la vía AA para elegir nodos es búsqueda + lista de conexiones + jerarquía.
- El contraste de arcos/partículas en el canvas no se audita como texto UI.
- No se añadió un framework de componentes; los cambios son puntuales sobre CSS/JSX existente.
