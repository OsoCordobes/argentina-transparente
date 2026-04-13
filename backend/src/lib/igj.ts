// IGJ — Inspección General de Justicia
//
// Fuente: datos.jus.gob.ar — "Entidades constituidas en la IGJ"
// Datos disponibles: directores, socios, fecha constitución (desde 2018+)
//
// Para poblar la base de datos local ejecutar:
//   npm run seed:igj
//
// Sin datos seeds, las consultas devuelven resultado vacío (graceful degradation)

import { isIGJLoaded, getDirectoresPorCuitIGJ } from './db'

export interface IGJResult {
  cuit: string
  directores: string[]
  socios: string[]
  fechaConstitucion: string | null
  domicilioRegistrado: string | null
  encontrado: boolean
  fuenteUrl: string
}

const IGJ_FUENTE_URL = 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c'

export async function consultarIGJ(cuit: string): Promise<IGJResult> {
  const empty: IGJResult = {
    cuit,
    directores: [],
    socios: [],
    fechaConstitucion: null,
    domicilioRegistrado: null,
    encontrado: false,
    fuenteUrl: IGJ_FUENTE_URL,
  }

  try {
    const loaded = await isIGJLoaded()
    if (!loaded) return empty

    const rows = await getDirectoresPorCuitIGJ(cuit)
    if (rows.length === 0) return empty

    const directores = rows
      .filter(r => r.tipo_administrador === 'A')
      .map(r => r.apellido_nombre)

    const socios = rows
      .filter(r => r.tipo_administrador === 'S')
      .map(r => r.apellido_nombre)

    return {
      cuit,
      directores,
      socios,
      fechaConstitucion: null, // not in autoridades table; needs entidades join with dates
      domicilioRegistrado: null,
      encontrado: true,
      fuenteUrl: IGJ_FUENTE_URL,
    }
  } catch (err) {
    console.warn(`[igj] Error consultando CUIT ${cuit}:`, err)
    return empty
  }
}
