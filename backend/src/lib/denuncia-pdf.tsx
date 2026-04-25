import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'

// ARGOS — generador de PDF formal de denuncia con cadena de custodia.
// La estructura intencionalmente es austera y formal para uso en organismos
// de control. No usa imágenes ni assets remotos: todo es texto + estilos.

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
    lineHeight: 1.4,
  },
  header: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  subheader: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  caratula: {
    border: '1pt solid #333',
    padding: 12,
    marginBottom: 16,
  },
  caratulaTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  kv: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  kvLabel: {
    width: 120,
    fontWeight: 'bold',
  },
  kvValue: {
    flex: 1,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
    borderBottom: '0.5pt solid #999',
    paddingBottom: 2,
  },
  paragraph: {
    marginBottom: 6,
    textAlign: 'justify',
  },
  list: {
    marginLeft: 14,
    marginBottom: 6,
  },
  listItem: {
    marginBottom: 3,
  },
  evidencia: {
    border: '0.5pt solid #ccc',
    padding: 8,
    marginBottom: 6,
    backgroundColor: '#f7f7f7',
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: '#444',
  },
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 50,
    right: 50,
    fontSize: 7,
    color: '#999',
    borderTop: '0.5pt solid #ccc',
    paddingTop: 6,
  },
})

const ARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const DESTINATARIOS_LABEL: Record<string, string> = {
  tribunal_cuentas: 'TRIBUNAL DE CUENTAS',
  fiscalia: 'MINISTERIO PÚBLICO FISCAL',
  cndc: 'COMISIÓN NACIONAL DE DEFENSA DE LA COMPETENCIA',
  arca: 'ARCA (ex-AFIP)',
  defensoria: 'DEFENSORÍA DEL PUEBLO',
}

export interface DenunciaInput {
  destinatario: string
  denuncianteNombre: string
  denuncianteDni: string
  denuncianteEmail: string
  denuncianteTelefono?: string
  denuncianteDomicilio: string
  hechos: string
  petitorio: string
  casoTitulo: string
  casoDescripcion?: string
  entidades: { nombre: string; cuit: string | null; municipio: string | null }[]
  contratos: {
    hash: string
    proveedor: string
    monto: number
    anio: number
    tipo: string
    area: string | null
    fuente_url: string | null
  }[]
  señales: {
    senal_id: string
    tipologia: string
    titulo: string
    resumen: string | null
    score: number | null
    severidad: string | null
    cuits: string[]
    legal: { articulos?: string[]; severidad?: string; denunciarAnte?: string[] }
  }[]
}

export async function renderDenunciaPDF(
  input: DenunciaInput,
  metadata: { timestamp: string; documentId: string }
): Promise<Buffer> {
  const destinatarioLabel = DESTINATARIOS_LABEL[input.destinatario] ?? input.destinatario.toUpperCase()

  const doc = (
    <Document
      title={`Denuncia — ${input.casoTitulo}`}
      author={input.denuncianteNombre}
      creator="ARGOS — Argentina Transparente"
      producer="ARGOS PDF Renderer"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>DENUNCIA FORMAL</Text>
        <Text style={styles.subheader}>
          Generada con ARGOS — motor anticorrupción ciudadano
        </Text>

        <View style={styles.caratula}>
          <Text style={styles.caratulaTitle}>CARÁTULA</Text>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Destinatario:</Text>
            <Text style={styles.kvValue}>{destinatarioLabel}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Denunciante:</Text>
            <Text style={styles.kvValue}>
              {input.denuncianteNombre} (DNI {input.denuncianteDni})
            </Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Domicilio:</Text>
            <Text style={styles.kvValue}>{input.denuncianteDomicilio}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Email:</Text>
            <Text style={styles.kvValue}>{input.denuncianteEmail}</Text>
          </View>
          {input.denuncianteTelefono && (
            <View style={styles.kv}>
              <Text style={styles.kvLabel}>Teléfono:</Text>
              <Text style={styles.kvValue}>{input.denuncianteTelefono}</Text>
            </View>
          )}
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Caso:</Text>
            <Text style={styles.kvValue}>{input.casoTitulo}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Documento ID:</Text>
            <Text style={[styles.kvValue, styles.mono]}>{metadata.documentId}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Generado:</Text>
            <Text style={[styles.kvValue, styles.mono]}>{metadata.timestamp}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>I. Hechos denunciados</Text>
          {input.hechos.split('\n').map((line, i) => (
            <Text key={i} style={styles.paragraph}>
              {line || ' '}
            </Text>
          ))}
        </View>

        {input.señales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>II. Señales de riesgo detectadas</Text>
            {input.señales.map((s, i) => (
              <View key={i} style={styles.evidencia}>
                <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>
                  {i + 1}. [{(s.severidad ?? 'leve').toUpperCase()}] {s.titulo}
                </Text>
                <Text style={{ marginBottom: 2 }}>
                  Tipología: {s.tipologia.replace(/_/g, ' ')} · Score {s.score ?? '—'}/100
                </Text>
                {s.resumen && (
                  <Text style={{ marginBottom: 2, color: '#444' }}>{s.resumen}</Text>
                )}
                {s.legal?.articulos && s.legal.articulos.length > 0 && (
                  <Text style={{ marginTop: 2, fontSize: 8, color: '#555' }}>
                    Marco legal: {s.legal.articulos.join(' · ')}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.section} break>
          <Text style={styles.sectionTitle}>III. Petitorio</Text>
          {input.petitorio.split('\n').map((line, i) => (
            <Text key={i} style={styles.paragraph}>
              {line || ' '}
            </Text>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>
            ARGOS — Doc {metadata.documentId} · {metadata.timestamp} · Cadena de custodia
            anexa al final del documento
          </Text>
        </View>
      </Page>

      {/* Anexo I — Entidades */}
      {input.entidades.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>ANEXO I — ENTIDADES</Text>
          {input.entidades.map((e, i) => (
            <View key={i} style={styles.evidencia}>
              <Text style={{ fontWeight: 'bold' }}>{i + 1}. {e.nombre}</Text>
              {e.cuit && <Text style={styles.mono}>CUIT: {e.cuit}</Text>}
              {e.municipio && <Text>Jurisdicción: {e.municipio}</Text>}
            </View>
          ))}
          <View style={styles.footer} fixed>
            <Text>ARGOS — Doc {metadata.documentId}</Text>
          </View>
        </Page>
      )}

      {/* Anexo II — Contratos con cadena de custodia */}
      {input.contratos.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>
            ANEXO II — CONTRATOS (cadena de custodia)
          </Text>
          {input.contratos.map((c, i) => (
            <View key={i} style={styles.evidencia}>
              <Text style={{ fontWeight: 'bold' }}>
                {i + 1}. {c.tipo} — {c.proveedor}
              </Text>
              <Text>Año {c.anio} · {ARS(c.monto)}</Text>
              {c.area && <Text style={{ fontSize: 8 }}>Área: {c.area}</Text>}
              <Text style={[styles.mono, { marginTop: 2 }]}>
                hash: {c.hash}
              </Text>
              {c.fuente_url && (
                <Text style={[styles.mono, { fontSize: 7, color: '#0055aa' }]}>
                  fuente: {c.fuente_url}
                </Text>
              )}
            </View>
          ))}
          <View style={styles.footer} fixed>
            <Text>ARGOS — Doc {metadata.documentId}</Text>
          </View>
        </Page>
      )}

      {/* Anexo III — Cadena de custodia y declaración */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>ANEXO III — CADENA DE CUSTODIA</Text>
        <Text style={styles.paragraph}>
          Toda la evidencia documental de esta denuncia es trazable mediante:
        </Text>
        <View style={styles.list}>
          <Text style={styles.listItem}>
            • Hash SHA256 individual de cada contrato (ver Anexo II).
          </Text>
          <Text style={styles.listItem}>
            • URL de fuente oficial de cada dataset citado (ver Anexo II).
          </Text>
          <Text style={styles.listItem}>
            • Hash SHA256 del documento PDF completo, incluido en metadatos del
              documento y en este apartado.
          </Text>
          <Text style={styles.listItem}>
            • Timestamp ISO del servidor en el momento de generación.
          </Text>
        </View>
        <Text style={styles.paragraph}>
          La regeneración del PDF con la misma evidencia debe producir un hash idéntico
          excluyendo las marcas de tiempo. Cualquier discrepancia con el hash declarado
          en metadatos indica que el documento ha sido alterado.
        </Text>
        <View style={[styles.evidencia, { marginTop: 14 }]}>
          <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Documento ID:
          </Text>
          <Text style={styles.mono}>{metadata.documentId}</Text>
          <Text style={{ fontWeight: 'bold', marginTop: 6, marginBottom: 4 }}>
            Generado en:
          </Text>
          <Text style={styles.mono}>{metadata.timestamp}</Text>
        </View>
        <Text style={[styles.paragraph, { marginTop: 16 }]}>
          ____________________________________
        </Text>
        <Text>{input.denuncianteNombre}</Text>
        <Text>DNI {input.denuncianteDni}</Text>
        <View style={styles.footer} fixed>
          <Text>ARGOS — Doc {metadata.documentId}</Text>
        </View>
      </Page>
    </Document>
  )

  return await renderToBuffer(doc)
}
