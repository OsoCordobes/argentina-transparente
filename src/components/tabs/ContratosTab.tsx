import { ContractsTable } from '@/components/tables/ContractsTable';
import { CompaniesTable } from '@/components/tables/CompaniesTable';
import { SpendingByCompanyChart } from '@/components/charts/SpendingByCompanyChart';

export function ContratosTab() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Explicación para el ciudadano */}
      <div className="bg-muted/50 rounded-lg p-4 border">
        <h2 className="font-serif font-semibold text-foreground mb-2">
          ¿Cómo funciona esto?
        </h2>
        <p className="text-sm text-muted-foreground mb-2">
          Cuando el municipio necesita un servicio (limpieza, obras, etc.), lanza una <strong>licitación</strong> donde 
          empresas privadas compiten para ganar el contrato. La empresa ganadora recibe el pago con dinero público.
        </p>
        <p className="text-sm text-muted-foreground">
          Aquí mostramos <strong>qué empresas ganaron y quiénes son sus dueños</strong>, para que sepas a dónde va tu dinero.
        </p>
      </div>

      {/* Empresas que reciben contratos */}
      <CompaniesTable />

      {/* Detalle de contratos */}
      <ContractsTable />

      {/* Gráfico de distribución */}
      <SpendingByCompanyChart />
    </div>
  );
}
