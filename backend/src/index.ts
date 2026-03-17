import express from 'express'
import analizarRouter from './routes/analizar'
import { cordobaCapitalConnector } from './connectors/cordoba-capital'

const app = express()
const PORT = process.env.PORT || 3001

// CORS — allow any origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json())

// GET /health
app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '2.0.0' })
})

// GET /municipios
app.get('/municipios', (_req, res) => {
  res.json([
    {
      id: cordobaCapitalConnector.id,
      nombre: cordobaCapitalConnector.nombre,
      aniosDisponibles: cordobaCapitalConnector.aniosDisponibles,
    },
  ])
})

// POST /analizar
app.use('/analizar', analizarRouter)

app.listen(PORT, () => {
  console.log(`La Bestia v2 corriendo en http://localhost:${PORT}`)
})
