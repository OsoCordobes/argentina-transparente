export interface MunicipioCordoba {
  id: string;
  name: string; // exact string sent to the backend API
  province: 'Córdoba';
  population: number;
  officialWebsite: string;
  hasDigitalPresence: boolean;
  dataPortal?: string;
  boletin?: string;
}

// Only municipalities with verified 200 HTTP responses are included.
// Last verified: 2026-03-17
export const municipiosCordoba: MunicipioCordoba[] = [
  {
    id: 'cordoba-capital',
    name: 'Córdoba, Argentina',
    province: 'Córdoba',
    population: 1391000,
    officialWebsite: 'https://gobiernoabierto.cordoba.gob.ar',
    hasDigitalPresence: true,
    dataPortal: 'https://gobiernoabierto.cordoba.gob.ar/data/api/3/action/package_list',
    boletin: 'https://boletinoficial.cba.gov.ar',
  },
  {
    id: 'rio-cuarto',
    name: 'Río Cuarto, Córdoba',
    province: 'Córdoba',
    population: 160000,
    officialWebsite: 'https://www.riocuarto.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'villa-maria',
    name: 'Villa María, Córdoba',
    province: 'Córdoba',
    population: 90000,
    officialWebsite: 'https://villamaria.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'alta-gracia',
    name: 'Alta Gracia, Córdoba',
    province: 'Córdoba',
    population: 50000,
    officialWebsite: 'https://altagracia.gob.ar',
    hasDigitalPresence: true,
    boletin: 'https://altagracia.gob.ar/seccion-doc/boletines-oficiales/',
  },
  {
    id: 'rio-tercero',
    name: 'Río Tercero, Córdoba',
    province: 'Córdoba',
    population: 47000,
    officialWebsite: 'https://riotercero.gob.ar',
    hasDigitalPresence: true,
    dataPortal: 'https://datos.riotercero.gob.ar/api/3/action/package_list',
  },
  {
    id: 'villa-allende',
    name: 'Villa Allende, Córdoba',
    province: 'Córdoba',
    population: 32000,
    officialWebsite: 'https://www.villaallende.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'la-calera',
    name: 'La Calera, Córdoba',
    province: 'Córdoba',
    population: 30000,
    officialWebsite: 'https://lacalera.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'cosquin',
    name: 'Cosquín, Córdoba',
    province: 'Córdoba',
    population: 20000,
    officialWebsite: 'https://cosquin.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'bell-ville',
    name: 'Bell Ville, Córdoba',
    province: 'Córdoba',
    population: 34000,
    officialWebsite: 'https://bellville.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'laboulaye',
    name: 'Laboulaye, Córdoba',
    province: 'Córdoba',
    population: 16000,
    officialWebsite: 'https://laboulaye.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'dean-funes',
    name: 'Deán Funes, Córdoba',
    province: 'Córdoba',
    population: 17000,
    officialWebsite: 'https://deanfunes.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'villa-del-rosario',
    name: 'Villa del Rosario, Córdoba',
    province: 'Córdoba',
    population: 15000,
    officialWebsite: 'https://villadelrosario.gob.ar',
    hasDigitalPresence: true,
  },
  {
    id: 'pilar',
    name: 'Pilar, Córdoba',
    province: 'Córdoba',
    population: 14000,
    officialWebsite: 'https://www.comunadepilar.gob.ar',
    hasDigitalPresence: true,
  },
];

export function formatPopulation(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M hab.`;
  if (n >= 1000) return `${Math.round(n / 1000)}k hab.`;
  return `${n} hab.`;
}
