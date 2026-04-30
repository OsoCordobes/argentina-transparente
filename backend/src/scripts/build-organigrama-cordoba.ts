// build-organigrama-cordoba.ts — Carga lista canónica de entes estatales.
// W1: stub con 10 entes pivote (para tests + migración Neo4j).
// W3: versión autónoma que construye desde organigrama oficial completo.

import 'dotenv/config'
import { initDb, dbRun } from '../lib/db'

interface EntePivote {
  id: string
  cuit?: string
  nombre: string
  jurisdiccion: 'cordoba-provincia' | 'cordoba-capital'
  tipo: 'ministerio' | 'secretaria' | 'estatal' | 'universidad' | 'concesion'
       | 'cooperativa' | 'tribunal' | 'legislatura' | 'caja'
  poder: 'ejecutivo' | 'legislativo' | 'judicial' | 'descentralizado'
  dependeDeId?: string
  leyCreacion?: string
  sitioWeb?: string
  fuenteUrl: string
}

const ENTES_PIVOTE: EntePivote[] = [
  {
    id: 'gob-cba-prov',
    nombre: 'Gobierno de la Provincia de Córdoba',
    jurisdiccion: 'cordoba-provincia',
    tipo: 'ministerio', poder: 'ejecutivo',
    sitioWeb: 'https://www.cba.gov.ar',
    fuenteUrl: 'https://www.cba.gov.ar/poder-ejecutivo/',
  },
  {
    id: 'min-finanzas-cba',
    nombre: 'Ministerio de Economía y Gestión Pública',
    jurisdiccion: 'cordoba-provincia', tipo: 'ministerio', poder: 'ejecutivo',
    dependeDeId: 'gob-cba-prov',
    sitioWeb: 'https://finanzas.cba.gov.ar',
    fuenteUrl: 'https://finanzas.cba.gov.ar',
  },
  {
    id: 'min-salud-cba',
    nombre: 'Ministerio de Salud',
    jurisdiccion: 'cordoba-provincia', tipo: 'ministerio', poder: 'ejecutivo',
    dependeDeId: 'gob-cba-prov',
    sitioWeb: 'https://www.cba.gov.ar/reparticion/ministerio-de-salud/',
    fuenteUrl: 'https://www.cba.gov.ar/reparticion/ministerio-de-salud/',
  },
  {
    id: 'epec',
    cuit: '30-54571408-7',
    nombre: 'Empresa Provincial de Energía de Córdoba (EPEC)',
    jurisdiccion: 'cordoba-provincia', tipo: 'estatal', poder: 'descentralizado',
    leyCreacion: 'Ley provincial 4358 (1953)',
    sitioWeb: 'https://www.epec.com.ar',
    fuenteUrl: 'https://www.epec.com.ar/institucional',
  },
  {
    id: 'bancor',
    cuit: '30-99921020-3',
    nombre: 'Banco de la Provincia de Córdoba (Bancor)',
    jurisdiccion: 'cordoba-provincia', tipo: 'estatal', poder: 'descentralizado',
    sitioWeb: 'https://www.bancor.com.ar',
    fuenteUrl: 'https://www.bancor.com.ar/institucional/',
  },
  {
    id: 'caminos-sierras',
    cuit: '30-69077820-3',
    nombre: 'Caminos de las Sierras S.A.',
    jurisdiccion: 'cordoba-provincia', tipo: 'estatal', poder: 'descentralizado',
    sitioWeb: 'https://www.caminosdelassierras.com.ar',
    fuenteUrl: 'https://www.caminosdelassierras.com.ar/institucional',
  },
  {
    id: 'loteria-cba',
    cuit: '30-54573123-2',
    nombre: 'Lotería de Córdoba S.E.',
    jurisdiccion: 'cordoba-provincia', tipo: 'estatal', poder: 'descentralizado',
    sitioWeb: 'https://www.loteriadecordoba.com.ar',
    fuenteUrl: 'https://www.loteriadecordoba.com.ar/institucional/',
  },
  {
    id: 'gob-cap-cba',
    nombre: 'Municipalidad de Córdoba',
    jurisdiccion: 'cordoba-capital', tipo: 'ministerio', poder: 'ejecutivo',
    sitioWeb: 'https://www.cordoba.gob.ar',
    fuenteUrl: 'https://www.cordoba.gob.ar',
  },
  {
    id: 'tamse',
    cuit: '30-71064850-3',
    nombre: 'Transporte Automotor Municipal Sociedad del Estado (TAMSE)',
    jurisdiccion: 'cordoba-capital', tipo: 'estatal', poder: 'descentralizado',
    sitioWeb: 'https://www.tamse.com.ar',
    fuenteUrl: 'https://www.tamse.com.ar/institucional',
  },
  {
    id: 'concejo-cap-cba',
    nombre: 'Concejo Deliberante de la Ciudad de Córdoba',
    jurisdiccion: 'cordoba-capital', tipo: 'legislatura', poder: 'legislativo',
    sitioWeb: 'https://www.cdcordoba.gob.ar',
    fuenteUrl: 'https://www.cdcordoba.gob.ar',
  },
]

async function main() {
  console.log('=== ARGOS — Build organigrama Córdoba (W1 stub: 10 pivote) ===\n')
  await initDb()

  const now = new Date().toISOString()
  let inserted = 0
  for (const e of ENTES_PIVOTE) {
    await dbRun(
      `INSERT OR REPLACE INTO entes_estatales_cordoba
        (id, cuit, nombre, jurisdiccion, tipo, poder, depende_de_id, ley_creacion, sitio_web, fuente_url, cargado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id, e.cuit ?? null, e.nombre, e.jurisdiccion, e.tipo, e.poder,
        e.dependeDeId ?? null, e.leyCreacion ?? null, e.sitioWeb ?? null,
        e.fuenteUrl, now,
      ]
    )
    inserted++
  }
  console.log(`✓ ${inserted} entes pivote cargados.`)
  console.log(`  W3 ampliará la lista al organigrama completo (~150 entes).`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
