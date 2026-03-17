import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ==================== INTERFACES ====================

export interface Locality {
  id: string;
  name: string;
  province: string;
  population?: number | null;
  dataUrl?: string | null;
  coordinates?: { lat: number; lng: number } | null;
}

export interface PublicEntityType {
  id: string;
  name: string;
  icon: string;
}

export interface PublicEntity {
  id: string;
  localityId: string;
  name: string;
  type: 'municipalidad' | 'registro_civil' | 'hospital' | 'escuela' | 'policia' | 'bomberos' | 'juzgado' | 'rentas' | 'obras_sanitarias';
  budget?: number;
  address?: string;
  phone?: string;
  website?: string;
}

// ==================== TIPOS DE ENTIDADES ====================

export const entityTypes: PublicEntityType[] = [
  { id: 'municipalidad', name: 'Municipalidad', icon: 'Building2' },
  { id: 'registro_civil', name: 'Registro Civil', icon: 'FileText' },
  { id: 'hospital', name: 'Hospital/Centro de Salud', icon: 'Hospital' },
  { id: 'escuela', name: 'Escuela Municipal', icon: 'GraduationCap' },
  { id: 'policia', name: 'Policía', icon: 'Shield' },
  { id: 'bomberos', name: 'Bomberos', icon: 'Flame' },
  { id: 'juzgado', name: 'Juzgado de Paz', icon: 'Scale' },
  { id: 'rentas', name: 'Dirección de Rentas', icon: 'Receipt' },
  { id: 'obras_sanitarias', name: 'Obras Sanitarias', icon: 'Droplets' },
];

// ==================== CONTEXT ====================

interface LocalityContextType {
  currentLocality: Locality;
  setCurrentLocality: (locality: Locality) => void;
  localities: Locality[];
  isLoading: boolean;
  getEntitiesForLocality: (localityId: string) => PublicEntity[];
  selectedEntityType: string;
  setSelectedEntityType: (type: string) => void;
}

const LocalityContext = createContext<LocalityContextType | undefined>(undefined);

// Default locality while loading
const defaultLocality: Locality = {
  id: '',
  name: 'Cargando...',
  province: '',
};

export function LocalityProvider({ children }: { children: ReactNode }) {
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [currentLocality, setCurrentLocalityState] = useState<Locality>(defaultLocality);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');

  // Fetch localities from database
  useEffect(() => {
    const fetchLocalities = async () => {
      try {
        const { data, error } = await supabase
          .from('localities')
          .select('id, name, province, population, data_url, coordinates')
          .order('name');

        if (error) throw error;

        if (data && data.length > 0) {
          // Remove duplicates by name (keep the first one)
          const uniqueLocalities = data.reduce((acc: Locality[], curr) => {
            const exists = acc.find(l => l.name === curr.name);
            if (!exists) {
              acc.push({
                id: curr.id,
                name: curr.name,
                province: curr.province,
                population: curr.population,
                dataUrl: curr.data_url,
                coordinates: curr.coordinates as { lat: number; lng: number } | null,
              });
            }
            return acc;
          }, []);

          setLocalities(uniqueLocalities);

          // Set current locality from localStorage or first available
          const savedId = localStorage.getItem('selectedLocality');
          const savedLocality = savedId 
            ? uniqueLocalities.find(l => l.id === savedId) 
            : null;
          
          setCurrentLocalityState(savedLocality || uniqueLocalities[0]);
        }
      } catch (err) {
        console.error('Error fetching localities:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLocalities();
  }, []);

  const setCurrentLocality = (locality: Locality) => {
    setCurrentLocalityState(locality);
    localStorage.setItem('selectedLocality', locality.id);
  };

  const getEntitiesForLocality = (_localityId: string): PublicEntity[] => {
    // This would fetch from DB in a real implementation
    return [];
  };

  return (
    <LocalityContext.Provider
      value={{
        currentLocality,
        setCurrentLocality,
        localities,
        isLoading,
        getEntitiesForLocality,
        selectedEntityType,
        setSelectedEntityType,
      }}
    >
      {children}
    </LocalityContext.Provider>
  );
}

export function useLocality() {
  const context = useContext(LocalityContext);
  if (!context) {
    throw new Error('useLocality must be used within a LocalityProvider');
  }
  return context;
}
