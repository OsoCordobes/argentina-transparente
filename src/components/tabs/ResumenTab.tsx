import { Building2, DollarSign, Users, TrendingUp, Info, Loader2, Play } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { SpendingByCompanyChart } from '@/components/charts/SpendingByCompanyChart';
import { SpendingByCategoryChart } from '@/components/charts/SpendingByCategoryChart';
import { MonthlyContractsChart } from '@/components/charts/MonthlyContractsChart';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, SALARIO_MINIMO_ARG } from '@/lib/format-utils';
import { useLocality } from '@/contexts/LocalityContext';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { useNavigate } from 'react-router-dom';

export function ResumenTab() {
  const navigate = useNavigate();
  const { currentLocality } = useLocality();
  const { stats, loading, companies, contracts } = useRealLocalityData();

  const totalContracts = stats.totalSpending;
  const uniqueCompanies = stats.uniqueCompanies;
  const uniqueOwners = companies.reduce((acc, c) => {
    const owners = c.owners || [];
    owners.forEach(o => acc.add(o));
    return acc;
  }, new Set<string>()).size;
  const equivalentSalaries = Math.round(totalContracts / SALARIO_MINIMO_ARG);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando datos de {currentLocality.name}...</span>
      </div>
    );
  }

  // Empty state - no real data
  if (contracts.length === 0 && companies.length === 0) {
    return (
      <EmptyState
        icon={Play}
        title="Sin datos para mostrar"
        description={`Aún no hay información analizada para ${currentLocality.name}. Inicia un análisis para obtener datos.`}
        action={{
          label: "Iniciar análisis",
          onClick: () => navigate('/'),
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Intro para el ciudadano */}
      <div className="bg-accent/50 rounded-lg p-4 border border-accent">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-serif font-semibold text-foreground mb-1">
              ¿Qué encontrarás aquí?
            </h2>
            <p className="text-sm text-muted-foreground">
              Este portal te muestra <strong>a qué empresas y personas les paga el municipio de {currentLocality.name}</strong> con 
              el dinero de tus impuestos. Toda la información proviene de fuentes públicas oficiales. 
              Nuestro objetivo es que puedas entender fácilmente cómo se gasta el dinero público.
            </p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Dinero en Contratos"
          value={formatCurrency(totalContracts)}
          subtitle="Total analizado"
          icon={DollarSign}
          tooltip="Total pagado a empresas privadas por servicios y obras públicas"
        />
        <StatCard
          title="Empresas Contratadas"
          value={uniqueCompanies}
          subtitle="Reciben pagos del municipio"
          icon={Building2}
          tooltip="Cantidad de empresas diferentes que han recibido contratos"
        />
        <StatCard
          title="Propietarios Identificados"
          value={uniqueOwners}
          subtitle="Dueños de las empresas"
          icon={Users}
          tooltip="Personas físicas o jurídicas identificadas como dueños de las empresas contratadas"
        />
        <StatCard
          title="Equivalente en Salarios"
          value={equivalentSalaries.toLocaleString('es-AR')}
          subtitle="Salarios mínimos"
          icon={TrendingUp}
          tooltip={`El total de contratos equivale a ${equivalentSalaries.toLocaleString('es-AR')} salarios mínimos (${formatCurrency(SALARIO_MINIMO_ARG)} c/u)`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingByCompanyChart />
        <SpendingByCategoryChart />
      </div>

      <MonthlyContractsChart />
    </div>
  );
}
