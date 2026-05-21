# Visualgrama → Draw.io XML Generator

Herramienta interna de la **Gerencia de Mejoramiento y Riesgo - Clínica Foscal**.

## Estructura del proyecto

```text
visualgrama-vercel/
├── index.html
├── foscal.png
├── html/
│   ├── tab-import.html
│   ├── tab-nodes.html
│   ├── tab-output.html
│   └── modals.html
├── css/
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   ├── nodes.css
│   └── responsive.css
├── js/
│   ├── config.js
│   ├── parser.js
│   ├── nodes.js
│   ├── xml.js
│   └── ui.js
└── vercel.json
```

## Ejecutar localmente

Como `index.html` carga fragmentos desde `html/`, usa un servidor local:

```bash
npx serve .
```

## Desplegar en Vercel

Sube el proyecto a GitHub y crea el proyecto en Vercel. La app es estática y no necesita build, base de datos ni backend.
