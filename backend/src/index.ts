import 'dotenv/config'

// Cinturón de seguridad: BigInt nativo no es JSON-safe. DuckDB devuelve
// COUNT/SUM como BigInt y aunque casteamos en cada función helper, este
// patch evita que un campo BigInt no contemplado tire el endpoint con
// "Do not know how to serialize a BigInt".
;(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this)
}

import express from 'express'
import analizarRouter from './routes/analizar'
import historialRouter from './routes/historial'
import dashboardRouter from './routes/dashboard'
import entidadRouter from './routes/entidad'
import contratoRouter from './routes/contrato'
import redRouter from './routes/red'
import denunciaRouter from './routes/denuncia'
import cruceRouter from './routes/cruce'
import scrapersRouter from './routes/scrapers'
import alertasRouter from './routes/alertas'
import chatRouter from './routes/chat'
import aiRouter from './routes/ai'
import watchlistRouter from './routes/watchlist'
import actoresRouter from './routes/actores'
import grafoRouter from './routes/grafo'
import coberturaRouter from './routes/cobertura'
import pesoRouter from './routes/peso'
import colaVerificacionRouter from './routes/cola-verificacion'
import { registrarFuente } from './lib/db'
import { fuenteCordobaCapital } from './connectors/cordoba-capital'
import { fuenteArgentinaCompra } from './connectors/argentina-compra'
import { fuenteCABA } from './connectors/caba'
import { fuenteSantaFe } from './connectors/santa-fe'
import { fuenteOpenSanctions } from './lib/opensanctions'
import { cordobaCapitalConnector } from './connectors/cordoba-capital'
import { argentinaCompraConnector } from './connectors/argentina-compra'
import { cabaConnector } from './connectors/caba'
import { santaFeConnector } from './connectors/santa-fe'
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
  const connectors = [cordobaCapitalConnector, argentinaCompraConnector, cabaConnector, santaFeConnector]
  res.json(connectors.map(c => ({
    id: c.id,
    nombre: c.nombre,
    aniosDisponibles: c.aniosDisponibles,
    tipo: c.tipo,
  })))
})

// New entity-centric API
app.use('/api/dashboard', dashboardRouter)
app.use('/api/entidad', entidadRouter)
app.use('/api/contrato', contratoRouter)
app.use('/api/red', redRouter)
app.use('/api/denuncia', denunciaRouter)
app.use('/api/cruce', cruceRouter)
app.use('/api/scrapers', scrapersRouter)
app.use('/api/alertas', alertasRouter)
app.use('/api/chat', chatRouter)
app.use('/api/ai', aiRouter)
app.use('/api/watchlist', watchlistRouter)
app.use('/api/actores', actoresRouter)
app.use('/api/grafo', grafoRouter)
app.use('/api/cobertura', coberturaRouter)
// PLAN-DATOS Fase B5: cadena de pago por partida — flujo Crédito → Pagado
app.use('/api', pesoRouter)
app.use('/api/cola-verificacion', colaVerificacionRouter)

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
      await registrarFuente(fuenteArgentinaCompra)
      await registrarFuente(fuenteCABA)
      await registrarFuente(fuenteSantaFe)
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
