// municipios-cordoba.ts
// Fuente única de verdad para el catálogo de municipios verificados.
// URLs verificadas con HTTP 200. NO agregar municipios sin verificar.

export interface Municipio {
  id: string;          // slug único
  name: string;        // nombre oficial para enviar a n8n (localityName)
  population: number;  // habitantes aprox.
  url: string;         // sitio oficial verificado
  seedUrls: string[];  // URLs de partida para el scraper
}

export const MUNICIPIOS: Municipio[] = [
  {
    id: "cordoba-capital",
    name: "Córdoba",
    population: 1400000,
    url: "https://gobiernoabierto.cordoba.gob.ar",
    seedUrls: [
      "https://gobiernoabierto.cordoba.gob.ar/data/api/3/action/package_list",
      "https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/erogaciones/compras-y-contrataciones/2",
      "https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/presupuesto-anual/presupuesto-anual/14",
      "https://webecommerce.cba.gov.ar/VistaPublica/ConsultaPublicaCotizacion.aspx?TIPO_CONSULTA_PUBLICA=LI",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=6&anio=2024",
    ],
  },
  {
    id: "rio-cuarto",
    name: "Río Cuarto",
    population: 160000,
    url: "https://www.riocuarto.gob.ar",
    seedUrls: [
      "https://www.riocuarto.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=Rio+Cuarto&anio=2024",
    ],
  },
  {
    id: "villa-maria",
    name: "Villa María",
    population: 90000,
    url: "https://villamaria.gob.ar",
    seedUrls: [
      "https://villamaria.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=Villa+Maria&anio=2024",
    ],
  },
  {
    id: "alta-gracia",
    name: "Alta Gracia",
    population: 50000,
    url: "https://altagracia.gob.ar",
    seedUrls: [
      "https://altagracia.gob.ar/wp-content/uploads/2024/03/ORDENANZA-No-12797-PRESUPUESTO-2024.pdf",
      "https://altagracia.gob.ar/wp-content/uploads/2024/03/ORDENANZA-No-12797-PRESUPUESTO-2024.-MENSUALIZADO.pdf",
      "https://altagracia.gob.ar/wp-content/uploads/2024/03/ORDENANZA-No-12798-TARIFARIA2024.pdf",
    ],
  },
  {
    id: "rio-tercero",
    name: "Río Tercero",
    population: 47000,
    url: "https://riotercero.gob.ar",
    seedUrls: [
      "https://datos.riotercero.gob.ar/api/3/action/package_list",
      "https://riotercero.gob.ar/pdfs/boletin/2024/12/31dic24.pdf",
      "https://riotercero.gob.ar/pdfs/boletin/2024/11/30nov24.pdf",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=6&anio=2024",
    ],
  },
  {
    id: "bell-ville",
    name: "Bell Ville",
    population: 34000,
    url: "https://bellville.gob.ar",
    seedUrls: [
      "https://bellville.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=Bell+Ville&anio=2024",
    ],
  },
  {
    id: "villa-allende",
    name: "Villa Allende",
    population: 32000,
    url: "https://www.villaallende.gob.ar",
    seedUrls: [
      "https://www.villaallende.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=Villa+Allende&anio=2024",
    ],
  },
  {
    id: "la-calera",
    name: "La Calera",
    population: 30000,
    url: "https://lacalera.gob.ar",
    seedUrls: [
      "https://lacalera.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=La+Calera&anio=2024",
    ],
  },
  {
    id: "cosquin",
    name: "Cosquín",
    population: 20000,
    url: "https://cosquin.gob.ar",
    seedUrls: [
      "https://cosquin.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=Cosquin&anio=2024",
    ],
  },
  {
    id: "dean-funes",
    name: "Deán Funes",
    population: 17000,
    url: "https://deanfunes.gob.ar",
    seedUrls: [
      "https://deanfunes.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=Dean+Funes&anio=2024",
    ],
  },
  {
    id: "laboulaye",
    name: "Laboulaye",
    population: 16000,
    url: "https://laboulaye.gob.ar",
    seedUrls: [
      "https://laboulaye.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=Laboulaye&anio=2024",
    ],
  },
  {
    id: "villa-del-rosario",
    name: "Villa del Rosario",
    population: 15000,
    url: "https://villadelrosario.gob.ar",
    seedUrls: [
      "https://villadelrosario.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&q=Villa+del+Rosario&anio=2024",
    ],
  },
  {
    id: "pilar",
    name: "Pilar",
    population: 14000,
    url: "https://www.comunadepilar.gob.ar",
    seedUrls: [
      "https://www.comunadepilar.gob.ar",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=5&anio=2024",
      "https://boletinoficial.cba.gov.ar/buscador?tipo=6&anio=2024",
    ],
  },
];

// EXCLUIDOS — timeout o sin URL verificada:
// Villa Carlos Paz, San Francisco, Jesús María, Cruz del Eje, Oncativo, Unquillo, Malagueño

export const getMunicipioById = (id: string) =>
  MUNICIPIOS.find((m) => m.id === id) ?? null;

export const getMunicipioByName = (name: string) =>
  MUNICIPIOS.find(
    (m) => m.name.toLowerCase() === name.toLowerCase()
  ) ?? null;
