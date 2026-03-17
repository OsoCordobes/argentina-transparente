import { useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Footer } from '@/components/layout/Footer';
import { ResumenTab } from '@/components/tabs/ResumenTab';
import { DatosTab } from '@/components/tabs/DatosTab';
import { AlertasTab } from '@/components/tabs/AlertasTab';
import { AnalisisTab } from '@/components/tabs/AnalisisTab';
import { ComparadorTab } from '@/components/tabs/ComparadorTab';
import { ConsciousnessOrb } from '@/components/landing/ConsciousnessOrb';
import { JobHistoryCard } from '@/components/dashboard/JobHistoryCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LayoutDashboard,
  Database,
  AlertTriangle,
  Brain,
  GitCompare,
  Crown,
} from 'lucide-react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('resumen');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader variant="dashboard" />

      <main className="flex-1 container py-6">
        {/* Job History - shown at top if there are recent jobs */}
        <div className="mb-6">
          <JobHistoryCard />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto flex-wrap gap-1">
            {/* Free tabs */}
            <TabsTrigger
              value="resumen"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Resumen</span>
            </TabsTrigger>
            <TabsTrigger
              value="datos"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Datos</span>
            </TabsTrigger>
            <TabsTrigger
              value="alertas"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="hidden sm:inline">Alertas</span>
            </TabsTrigger>

            {/* Premium tabs with badge */}
            <TabsTrigger
              value="analisis"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Análisis IA</span>
              <Crown className="h-3 w-3 text-warning" />
            </TabsTrigger>
            <TabsTrigger
              value="comparador"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <GitCompare className="h-4 w-4" />
              <span className="hidden sm:inline">Comparador</span>
              <Crown className="h-3 w-3 text-warning" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="mt-6">
            <ResumenTab />
          </TabsContent>
          <TabsContent value="datos" className="mt-6">
            <DatosTab />
          </TabsContent>
          <TabsContent value="alertas" className="mt-6">
            <AlertasTab />
          </TabsContent>
          <TabsContent value="analisis" className="mt-6">
            <AnalisisTab />
          </TabsContent>
          <TabsContent value="comparador" className="mt-6">
            <ComparadorTab />
          </TabsContent>
        </Tabs>
      </main>

      <Footer />

      {/* Floating La Bestia Consciousness Orb */}
      <ConsciousnessOrb />
    </div>
  );
}
