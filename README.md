# Visualgrama → Draw.io XML Generator

Herramienta interna de la **Gerencia de Mejoramiento y Riesgo – Clínica Foscal**.

## Estructura del proyecto

```
visualgrama-vercel/
├── public/
│   ├── index.html                      ← Página principal
│   ├── visualgrama_xml_generator.css   ← Estilos
│   ├── visualgrama_xml_generator.js    ← Lógica
│   └── foscal.png                      ← Logo
└── vercel.json                         ← Configuración Vercel
```

## Cómo desplegarlo en Vercel (paso a paso)

### Opción A — Desde GitHub (recomendado)

1. Crea una cuenta gratuita en [github.com](https://github.com)
2. Crea un repositorio nuevo (puede ser privado)
3. Sube todos los archivos de esta carpeta al repositorio
4. Ve a [vercel.com](https://vercel.com) y crea una cuenta gratuita
5. Haz clic en **"Add New Project"**
6. Conecta tu cuenta de GitHub y selecciona el repositorio
7. Vercel detecta automáticamente la configuración — haz clic en **"Deploy"**
8. En ~30 segundos tendrás una URL pública tipo: `https://visualgrama.vercel.app`

### Opción B — Desde la CLI de Vercel (sin GitHub)

```bash
# 1. Instalar Vercel CLI
npm install -g vercel

# 2. Desde dentro de la carpeta visualgrama-vercel/
cd visualgrama-vercel
vercel

# 3. Seguir el asistente:
#    - Set up and deploy? → Y
#    - Which scope? → tu cuenta
#    - Link to existing project? → N
#    - Project name → visualgrama (o el que quieras)
#    - In which directory is your code? → ./
#    - Override settings? → N
```

## Actualizar la app

Cada vez que subas cambios al repositorio de GitHub, Vercel redespliega automáticamente.

## Notas

- La app es **100% estática** — no necesita base de datos ni backend.
- Funciona en cualquier navegador moderno.
- El logo y los estilos se sirven correctamente desde `/public/`.
