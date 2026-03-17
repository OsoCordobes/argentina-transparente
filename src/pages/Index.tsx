import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { FilterPanel, FilterState } from '@/components/filters/FilterPanel';
import { ResumenTab } from '@/components/tabs/ResumenTab';
import { ContratosTab } from '@/components/tabs/ContratosTab';
import { PresupuestosTab } from '@/components/tabs/PresupuestosTab';
import { ActualizacionesTab } from '@/components/tabs/ActualizacionesTab';
import { AnalisisTab } from '@/components/tabs/AnalisisTab';
import { AlertasTab } from '@/components/tabs/AlertasTab';
import { EntidadesTab } from '@/components/tabs/EntidadesTab';
import { ComparadorTab } from '@/components/tabs/ComparadorTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LayoutDashboard,
  Handshake,
  PiggyBank,
  RefreshCw,
  Brain,
  AlertTriangle,
  Building2,
  GitCompare,
} from 'lucide-react';

export default function Index() {
  const [activeTab, setActiveTab] = useState('resumen');
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    source: 'all',
    docType: 'all',
    dateFrom: '',
    dateTo: '',
  });

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container py-6">
        {/* Filters */}
        <div className="mb-6">
          <FilterPanel onFilterChange={handleFilterChange} />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto flex-wrap gap-1">
            <TabsTrigger
              value="resumen"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Resumen</span>
            </TabsTrigger>
            <TabsTrigger
              value="contratos"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Handshake className="h-4 w-4" />
              <span className="hidden sm:inline">Contratos</span>
            </TabsTrigger>
            <TabsTrigger
              value="entidades"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Entidades</span>
            </TabsTrigger>
            <TabsTrigger
              value="presupuestos"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <PiggyBank className="h-4 w-4" />
              <span className="hidden sm:inline">Presupuesto</span>
            </TabsTrigger>
            <TabsTrigger
              value="alertas"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="hidden sm:inline">Alertas</span>
            </TabsTrigger>
            <TabsTrigger
              value="comparador"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <GitCompare className="h-4 w-4" />
              <span className="hidden sm:inline">Comparador</span>
            </TabsTrigger>
            <TabsTrigger
              value="analisis"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Análisis IA</span>
            </TabsTrigger>
            <TabsTrigger
              value="actualizaciones"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Fuentes</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="mt-6">
            <ResumenTab />
          </TabsContent>
          <TabsContent value="contratos" className="mt-6">
            <ContratosTab />
          </TabsContent>
          <TabsContent value="entidades" className="mt-6">
            <EntidadesTab />
          </TabsContent>
          <TabsContent value="presupuestos" className="mt-6">
            <PresupuestosTab />
          </TabsContent>
          <TabsContent value="alertas" className="mt-6">
            <AlertasTab />
          </TabsContent>
          <TabsContent value="comparador" className="mt-6">
            <ComparadorTab />
          </TabsContent>
          <TabsContent value="analisis" className="mt-6">
            <AnalisisTab />
          </TabsContent>
          <TabsContent value="actualizaciones" className="mt-6">
            <ActualizacionesTab />
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
}
