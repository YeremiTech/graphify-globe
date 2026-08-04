# Graphify Globe React Responsive

Visualizador local de archivos `graph.json` generados por Graphify, construido con React, Vite y Three.js.

![Vista previa de Graphify Globe](docs/preview.png)

## Demo

https://yeremitech.github.io/graphify-globe/

## Funciones

- El globo inicia vacío y carga el archivo mediante el selector o arrastrándolo a la ventana.
- El buscador está integrado dentro del panel izquierdo.
- La búsqueda filtra por nombre, clase, método, archivo, paquete, tipo e ID.
- El nodo seleccionado se muestra en blanco.
- Los destinos de relaciones salientes se muestran en magenta.
- Los orígenes de relaciones entrantes se muestran en cian.
- Los nodos con conexiones en ambas direcciones se muestran en amarillo.
- Las relaciones seleccionadas incluyen líneas y partículas animadas.
- Los nodos no relacionados se atenúan para mejorar la lectura.
- La interfaz se adapta a escritorio, tablet, móvil y pantallas en orientación horizontal.
- El archivo JSON se procesa localmente en el navegador mediante un Web Worker.

## Requisitos

- Node.js 20.19 o superior.
- npm 10 o superior.

## Instalación

```powershell
npm install
npm run dev
```

Abre la dirección mostrada por Vite, normalmente:

```text
http://localhost:5173
```

También puedes ejecutar `INICIAR-WINDOWS.bat`.

## Importar el grafo

Selecciona directamente el archivo generado por Graphify:

```text
graph.json
```

No es necesario copiarlo dentro del proyecto.

## Producción

```powershell
npm run build
npm run preview
```

La compilación se genera en `dist`.
