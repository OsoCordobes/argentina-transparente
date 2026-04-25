// seed-upc.ts — Carga licitaciones y contrataciones de la Universidad Provincial
// de Córdoba (UPC) en DuckDB vía WP REST API.
//
// Fuente: https://www.upc.edu.ar/wp-json/wp/v2/posts
// Búsquedas: "licitacion", "compra directa", "concurso de precios",
//            "contratacion directa"
//
// Limitación: proveedor y monto solo se extraen cuando aparecen LITERALMENTE en
// el HTML del post (la mayoría de adjudicaciones están en PDFs no parseados).
// Los contratos con proveedor="" y monto=0 representan licitaciones anunciadas
// pero cuya adjudicación no fue publicada en el cuerpo del post.
//
// Uso:
//   npm run seed:upc
//   npm run seed:upc -- --force   (re-inserta aunque ya existan)

import 'dotenv/config'
import {
  initDb, insertContratoBatch, registrarFuente, getContratosCount,
} from '../lib/db'
import { listarLicitaciones } from '../lib/upc'
import type { Contrato, FuenteMetadata } from '../types'

const MUNICIPIO = 'upc'
const FUENTE: FuenteMetadata = {
  id: 'upc-licitaciones',
  jurisdiccion: 'Universidad Provincial de Córdoba (UPC)',
  url: 'https://www.upc.edu.ar/wp-json/wp/v2/posts',
  formato: 'JSON (WordPress REST API v2)',
  oficial: true,
  nivelConfianza: 'medio',
  frecuenciaActualizacion: 'eventual',
  notas: [
    'La UPC publica licitaciones y contrataciones como posts WordPress.',
    'Proveedor y monto se extraen solo cuando están literalmente en el HTML.',
    'La mayoría de adjudicaciones están en PDFs de resoluciones rectorales',
    'no parseados en esta versión — quedan como proveedor="" y monto=0.',
    'Cobertura: 2022–presente (las licitaciones anteriores no están publicadas).',
  ].join(' '),
}

function licitacionToContrato(lic: {
  postId: number
  url: string
  fecha: string
  tipo: string
  numero: string | null
  objeto: string
  monto: number
  proveedor: string
}): Contrato {
  const anio = parseInt(lic.fecha.slice(0, 4)) || new Date().getFullYear()
  return {
    tipo: lic.tipo,
    proveedor: lic.proveedor || 'SIN ADJUDICAR',
    area: 'Secretaría de Administración y RRHH - UPC',
    descripcion: lic.objeto,
    monto: lic.monto,
    anio,
    fuenteUrl: lic.url,
    numeroContrato: lic.numero ?? undefined,
    fechaContrato: lic.fecha,
    nivelConfianza: 'medio',
    metodoExtraccion: 'scraper_html',
  }
}

async function main() {
  console.log('=== ARGOS — Seed UPC (Universidad Provincial de Córdoba) ===\n')

  const force = process.argv.includes('--force')

  await initDb()
  await registrarFuente(FUENTE)

  const preCount = await getContratosCount(MUNICIPIO)
  if (preCount > 0 && !force) {
    console.log(`Ya hay ${preCount} contratos UPC en DB. Usar --force para re-cargar.`)
    process.exit(0)
  }

  console.log('Descargando licitaciones desde WP REST API...')
  const licitaciones = await listarLicitaciones({
    onProgress: (txt) => console.log(txt),
  })

  console.log(`\n✓ ${licitaciones.length} licitaciones encontradas con título relevante`)

  const conProveedorOrMonto = licitaciones.filter(l => l.proveedor || l.monto > 0)
  const sinDatos = licitaciones.filter(l => !l.proveedor && l.monto === 0)
  console.log(`  Con proveedor o monto: ${conProveedorOrMonto.length}`)
  console.log(`  Solo metadatos (proveedor/monto en PDF): ${sinDatos.length}`)

  if (licitaciones.length === 0) {
    console.log('\n⚠ Sin licitaciones para cargar.')
    process.exit(0)
  }

  const contratos = licitaciones.map(licitacionToContrato)
  const insertados = await insertContratoBatch(MUNICIPIO, contratos)

  const totalUPC = await getContratosCount(MUNICIPIO)
  console.log(`\n━━━ Resumen ━━━`)
  console.log(`Licitaciones parseadas:   ${licitaciones.length}`)
  console.log(`Contratos insertados:     ${insertados}`)
  console.log(`Total UPC en DB:          ${totalUPC}`)
  console.log(`\n✓ Próximo paso: npm run analyze --force`)

  process.exit(0)
}

main().catch(err => {
  console.error('\nError fatal:', err)
  process.exit(1)
})
