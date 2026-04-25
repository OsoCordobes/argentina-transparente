# Backend para modo Explorar — IMPLEMENTADO

> Este archivo documenta el endpoint de chat con LLM que originalmente era un
> pendiente. Ahora está implementado en `backend/src/routes/chat.ts`.

## POST /api/chat (streaming SSE)

### Request

```json
POST /api/chat
Content-Type: application/json

{
  "message": "¿Qué señales tiene Empresa ABC?",
  "focusNodeId": "empresa abc"
}
```

### Response (SSE)

```
data: {"delta": "Empresa ABC tiene "}
data: {"delta": "3 señales graves..."}
data: {"done": true}
```

Errores se envían como un evento final `data: {"error": "...", "done": true}`.

### Cómo funciona

El endpoint usa **tool use** de Claude Sonnet 4.5 con 5 tools que consultan
DuckDB en vivo. El LLM no recibe los datos del grafo en el prompt — los pide
on-demand. Esto previene alucinaciones: si la tool no devuelve nada, el modelo
responde "no tengo ese dato".

Tools disponibles:

| Tool | Descripción |
|------|-------------|
| `get_dashboard` | Totales + top 15 entidades + señales graves |
| `search_entidad(query)` | Búsqueda parcial por nombre |
| `get_entidad(nombre)` | Detalle (montos, timeline, AFIP, señales) |
| `get_señales_municipio(municipio)` | Señales de una jurisdicción |
| `get_señales_graves(limit)` | Top N señales graves globales |

### Activación en el frontend

```bash
# .env.development o .env.production
VITE_CHAT_LLM=true
```

Si la variable no está seteada o el endpoint falla (network, 429, 503), el
frontend cae automáticamente al resolver local (`chatResolver.ts`) sin
perder UX.

### Rate limit

10 requests / minuto / IP (in-memory). Para producción cambiar a Redis o
middleware dedicado (`express-rate-limit`).

### Variables de entorno (backend)

```
ANTHROPIC_API_KEY=sk-ant-...
```

Si no está seteada, el endpoint responde 503 y el frontend cae al fallback.
