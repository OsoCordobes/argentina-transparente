# Pendientes — Backend para modo Explorar

## POST /api/chat (streaming SSE)

El modo Explorar actualmente usa `chatResolver.ts` (respuestas locales basadas
en el grafo en memoria, sin LLM). Para habilitar el chat con IA real se necesita:

### Endpoint

```
POST /api/chat
Content-Type: application/json

{
  "message": "¿Qué señales tiene Empresa ABC?",
  "context": {
    "focusNodeId": "empresa abc",
    "graph": { "nodes": [...], "edges": [...] }
  }
}
```

### Respuesta (SSE / chunked)

```
data: {"delta": "Empresa ABC tiene "}
data: {"delta": "3 señales de riesgo:"}
data: {"entidades": [{"id": "empresa abc", "type": "proveedor", "label": "Empresa ABC"}]}
data: {"focus": {"nodeId": "empresa abc"}}
data: {"done": true}
```

### Implementación sugerida

```typescript
// backend/src/routes/chat.ts
router.post('/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const { message, context } = req.body
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: buildArgosSystemPrompt(context),
    messages: [{ role: 'user', content: message }],
  })

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      res.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`)
    }
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  res.end()
})
```

### Cuándo migrar

1. Implementar el endpoint en backend
2. En `chatResolver.ts`, reemplazar `resolveChat()` por un fetch() SSE
3. El formato de chunks es idéntico — el frontend no necesita cambios

## GET /api/explorar/grafo (opcional)

Para un grafo más rico (directores, contratos individuales, señales cruzadas
por CUIT) se puede agregar un endpoint dedicado:

```
GET /api/explorar/grafo?municipio=cordoba-capital&limit=100
```

Hoy el frontend usa `GET /api/dashboard` como fuente y construye el grafo
localmente en `graphFromData.ts`. Funciona correctamente para el MVP.
