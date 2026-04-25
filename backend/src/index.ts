import 'dotenv/config'
import express from 'express'
import analizarRouter from './routes/analizar'
import historialRouter from './routes/historial'
import dashboardRouter from './routes/dashboard'
import entidadRouter from './routes/entidad'
import contratoRouter from './routes/contrato'
import redRouter from './routes/red'
import denunciaRouter from './routes/denuncia'
import cruceRouter from './routes/cruce'
import { registrarFuente } from './lib/db'
import { fuenteCordobaCapital } from './connectors/cordoba-capital'
import { fuenteOpenSanctions } from './lib/opensanctions'
import { cordobaCapitalConnector } from './connectors/cordoba-capital'
import { initDb, getReporte } from './lib/db'
import { initGraph } from './lib/graph'

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
  res.json({ ok: true, version: '3.0.0' })
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

// New entity-centric API
app.use('/api/dashboard', dashboardRouter)
app.use('/api/entidad', entidadRouter)
app.use('/api/contrato', contratoRouter)
app.use('/api/red', redRouter)
app.use('/api/denuncia', denunciaRouter)
app.use('/api/cruce', cruceRouter)

// Legacy routes (still used by current frontend)
app.use('/analizar', analizarRouter)
app.use('/historial', historialRouter)

// GET /reporte/:id
app.get('/reporte/:id', async (req, res) => {
  try {
    const reporte = await getReporte(req.params.id)
    if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' })
    res.json(reporte)
  } catch (err) {
    console.error('[reporte] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Inicializar DB + grafo y arrancar servidor
Promise.all([initDb(), initGraph()])
  .then(async () => {
    // Sprint 4: registrar fuentes conocidas en fuentes_datos (idempotente)
    try {
      await registrarFuente(fuenteCordobaCapital)
      await registrarFuente(fuenteOpenSanctions)
    } catch (err) {
      console.warn('[fuentes] Error registrando fuentes iniciales:', err)
    }

    app.listen(PORT, () => {
      console.log(`ARGOS v3 corriendo en http://localhost:${PORT}`)
    })
  })
  .catch(err => {
    console.error('Error inicializando servicios:', err)
    process.exit(1)
  })
