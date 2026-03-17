import { useState } from 'react';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { useLocality } from '@/contexts/LocalityContext';
import { formatCurrency, amountToContext } from '@/lib/format-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Handshake, 
  Building2, 
  Users, 
  Loader2, 
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type ViewMode = 'contracts' | 'companies' | 'officials';

export function DataExplorer() {
  const { currentLocality } = useLocality();
  const { contracts, companies, officials, loading } = useRealLocalityData();
  const [viewMode, setViewMode] = useState<ViewMode>('contracts');
  const [search, setSearch] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const filteredContracts = contracts.filter(c => 
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description?.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.cuit?.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredOfficials = officials.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.position?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando datos de {currentLocality.name}...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with view mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-foreground">
            Explorador de Datos
          </h2>
          <p className="text-muted-foreground">
            Datos públicos de {currentLocality.name}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'contracts' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('contracts')}
            className="gap-2"
          >
            <Handshake className="h-4 w-4" />
            Contratos ({contracts.length})
          </Button>
          <Button
            variant={viewMode === 'companies' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('companies')}
            className="gap-2"
          >
            <Building2 className="h-4 w-4" />
            Empresas ({companies.length})
          </Button>
          <Button
            variant={viewMode === 'officials' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('officials')}
            className="gap-2"
          >
            <Users className="h-4 w-4" />
            Funcionarios ({officials.length})
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Buscar ${viewMode === 'contracts' ? 'contratos' : viewMode === 'companies' ? 'empresas' : 'funcionarios'}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Contracts View */}
      {viewMode === 'contracts' && (
        <div className="space-y-3">
          {filteredContracts.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {search ? 'No se encontraron contratos con ese término' : 'No hay contratos registrados'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredContracts.map(contract => (
              <Collapsible 
                key={contract.id}
                open={expandedItems.has(contract.id)}
                onOpenChange={() => toggleExpanded(contract.id)}
              >
                <Card>
                  <CollapsibleTrigger className="w-full text-left">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Handshake className="h-4 w-4 text-primary shrink-0" />
                            <CardTitle className="text-base font-semibold truncate">
                              {contract.company_name}
                            </CardTitle>
                          </div>
                          <CardDescription className="line-clamp-1">
                            {contract.description}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="font-bold text-primary">{formatCurrency(contract.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(contract.date).toLocaleDateString('es-AR')}
                            </p>
                          </div>
                          {expandedItems.has(contract.id) ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Tipo</p>
                          <Badge variant="outline">{contract.document_type}</Badge>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Estado</p>
                          <Badge variant={contract.status === 'adjudicado' ? 'default' : 'secondary'}>
                            {contract.status}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Oferentes</p>
                          <p className="font-medium">{contract.bidders_count}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Días hasta adjudicación</p>
                          <p className="font-medium">{contract.days_to_award || 'N/A'}</p>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">Descripción completa</p>
                        <p className="text-sm">{contract.description}</p>
                      </div>

                      <div>
                        <p className="text-muted-foreground text-xs mb-1">Equivalente</p>
                        <p className="text-sm">{amountToContext(contract.amount).join(' • ')}</p>
                      </div>

                      {contract.document_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={contract.document_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-2" />
                            Ver documento
                          </a>
                        </Button>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>
      )}

      {/* Companies View */}
      {viewMode === 'companies' && (
        <div className="space-y-3">
          {filteredCompanies.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {search ? 'No se encontraron empresas con ese término' : 'No hay empresas registradas'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredCompanies.map(company => (
              <Card key={company.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base font-semibold">
                          {company.name}
                        </CardTitle>
                        {company.has_government_only_clients && (
                          <Badge variant="destructive" className="text-xs">Solo Estado</Badge>
                        )}
                      </div>
                      <CardDescription>
                        CUIT: {company.cuit || 'No registrado'}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{formatCurrency(company.total_contracts_value)}</p>
                      <p className="text-xs text-muted-foreground">
                        {company.contracts_count} contratos
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Propietarios</p>
                      <p className="font-medium">{company.owners?.join(', ') || 'No registrado'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Sector</p>
                      <p className="font-medium">{company.sector || 'No especificado'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Domicilio</p>
                      <p className="font-medium">{company.registered_address || 'No registrado'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Fecha fundación</p>
                      <p className="font-medium">
                        {company.founded_date 
                          ? new Date(company.founded_date).toLocaleDateString('es-AR')
                          : 'No registrada'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Officials View */}
      {viewMode === 'officials' && (
        <div className="space-y-3">
          {filteredOfficials.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {search ? 'No se encontraron funcionarios con ese término' : 'No hay funcionarios registrados'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredOfficials.map(official => (
              <Card key={official.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base font-semibold">
                          {official.name}
                        </CardTitle>
                      </div>
                      <CardDescription>
                        {official.position}
                      </CardDescription>
                    </div>
                    {official.source_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={official.source_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Área</p>
                      <p className="font-medium">{official.area || 'No especificada'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">En funciones desde</p>
                      <p className="font-medium">
                        {official.start_date 
                          ? new Date(official.start_date).toLocaleDateString('es-AR')
                          : 'No registrada'}
                      </p>
                    </div>
                    {official.relatives && official.relatives.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Familiares declarados</p>
                        <p className="font-medium">{official.relatives.join(', ')}</p>
                      </div>
                    )}
                    {official.previous_employers && official.previous_employers.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Empleadores anteriores</p>
                        <p className="font-medium">{official.previous_employers.join(', ')}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
