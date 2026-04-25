# ARGOS — Argentina Transparente

Motor anticorrupción ciudadano. Análisis automatizado del gasto público argentino.

## ¿Qué hace ARGOS?

ARGOS descarga, normaliza y analiza datos de compras y contrataciones públicas para detectar señales de riesgo (prórrogas excesivas, concentración de proveedores, contrataciones directas sospechosas, redes de empresas con directores compartidos, entre otras) y generar **expedientes ciudadanos verificables** que pueden presentarse ante Tribunal de Cuentas, Fiscalía, CNDC, ARCA o Defensoría.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Tailwind + Vite |
| Backend | Node.js + TypeScript + Express |
| Datos | DuckDB (analítica) + Neo4j (red de directores) |
| LLM | Claude Sonnet 4 (Anthropic SDK) |
| Auth + persistencia de casos | Supabase |
| Deploy | Railway |

## Arquitectura

Ver [`CLAUDE.md`](./CLAUDE.md) para el detalle del estado técnico, arquitectura, señales implementadas, fuentes de datos verificadas y roadmap.

## Desarrollo local

Requisitos: Node.js 20+, npm.

```sh
# Backend
cd backend
npm install
cp .env.example .env  # configurar ANTHROPIC_API_KEY
npm run dev           # http://localhost:3001

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev           # http://localhost:5173
```

## Tests

```sh
cd backend
npm run test:connector              # descarga + parseo
npm run test:signals 2019 2023      # 5 años de Córdoba Capital
npm run test:e2e                    # E2E contra localhost:3001
```

## Principios

- Cero alucinaciones. Toda salida importante debe ser verificable.
- Toda señal o hallazgo debe poder reconstruirse desde la fuente original.
- Trazabilidad de datos: origen, fecha, método, formato, nivel de confianza.
- Diseñado para escalar de un municipio a nivel nacional.

Ver [`CLAUDE.md`](./CLAUDE.md) sección "Instrucciones fijas" para el detalle completo.

## Licencia

Por definir.
