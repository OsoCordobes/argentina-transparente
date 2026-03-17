import { useState, useMemo, useEffect } from 'react';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { formatCurrency } from '@/lib/format-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, User, Briefcase, Link2, AlertTriangle, ZoomIn, ZoomOut, RotateCcw, Loader2 } from 'lucide-react';

interface Node {
  id: string;
  label: string;
  type: 'company' | 'owner' | 'official';
  x: number;
  y: number;
  hasRedFlag?: boolean;
}

interface Edge {
  source: string;
  target: string;
  type: 'owns' | 'relative' | 'contracts' | 'worked_at';
  amount?: number;
}

export function ConnectionGraph() {
  const { companies, officials, contracts, loading } = useRealLocalityData();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'red_flags' | 'officials'>('all');
  const [zoom, setZoom] = useState(1);

  // Build nodes and edges from real data
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, Node>();
    const edgeList: Edge[] = [];

    // Add company nodes
    companies.forEach((company, idx) => {
      const angle = (idx / companies.length) * 2 * Math.PI;
      const radius = 120;
      nodeMap.set(`company-${company.id}`, {
        id: `company-${company.id}`,
        label: company.name,
        type: 'company',
        x: 200 + Math.cos(angle) * radius,
        y: 150 + Math.sin(angle) * radius,
        hasRedFlag: company.has_government_only_clients || company.unusual_growth,
      });

      // Add owner nodes and edges
      (company.owners || []).forEach((owner, ownerIdx) => {
        const ownerId = `owner-${owner.replace(/\s+/g, '-').toLowerCase()}`;
        if (!nodeMap.has(ownerId)) {
          const ownerAngle = angle + (ownerIdx * 0.3);
          nodeMap.set(ownerId, {
            id: ownerId,
            label: owner,
            type: 'owner',
            x: 200 + Math.cos(ownerAngle) * (radius + 60),
            y: 150 + Math.sin(ownerAngle) * (radius + 60),
          });
        }
        edgeList.push({
          source: ownerId,
          target: `company-${company.id}`,
          type: 'owns',
        });
      });
    });

    // Add official nodes
    officials.forEach((official, idx) => {
      const angle = (idx / Math.max(officials.length, 1)) * 2 * Math.PI + Math.PI / 4;
      const radius = 180;
      nodeMap.set(`official-${official.id}`, {
        id: `official-${official.id}`,
        label: official.name,
        type: 'official',
        x: 200 + Math.cos(angle) * radius,
        y: 150 + Math.sin(angle) * radius,
      });

      // Add relative connections
      (official.relatives || []).forEach(relative => {
        const relId = `owner-${relative.replace(/\s+/g, '-').toLowerCase()}`;
        if (nodeMap.has(relId)) {
          edgeList.push({
            source: `official-${official.id}`,
            target: relId,
            type: 'relative',
          });
        }
      });

      // Add previous employer connections
      (official.previous_employers || []).forEach(employer => {
        const matchingCompany = companies.find(c => 
          c.name.toLowerCase().includes(employer.toLowerCase()) ||
          employer.toLowerCase().includes(c.name.toLowerCase())
        );
        if (matchingCompany) {
          edgeList.push({
            source: `official-${official.id}`,
            target: `company-${matchingCompany.id}`,
            type: 'worked_at',
          });
        }
      });
    });

    // Add contract edges
    contracts.forEach(contract => {
      const company = companies.find(c => c.id === contract.company_id || c.name === contract.company_name);
      if (company) {
        edgeList.push({
          source: `company-${company.id}`,
          target: `company-${company.id}`,
          type: 'contracts',
          amount: contract.amount,
        });
      }
    });

    return { nodes: Array.from(nodeMap.values()), edges: edgeList };
  }, [companies, officials, contracts]);

  const getNodeColor = (node: Node) => {
    if (node.hasRedFlag) return 'hsl(var(--destructive))';
    switch (node.type) {
      case 'company': return 'hsl(var(--chart-1))';
      case 'owner': return 'hsl(var(--chart-2))';
      case 'official': return 'hsl(var(--chart-3))';
      default: return 'hsl(var(--muted))';
    }
  };

  const getEdgeColor = (type: Edge['type']) => {
    switch (type) {
      case 'owns': return 'hsl(var(--chart-2) / 0.5)';
      case 'relative': return 'hsl(var(--destructive) / 0.5)';
      case 'contracts': return 'hsl(var(--chart-1) / 0.3)';
      case 'worked_at': return 'hsl(var(--chart-3) / 0.5)';
      default: return 'hsl(var(--muted))';
    }
  };

  const getNodeIcon = (type: Node['type']) => {
    switch (type) {
      case 'company': return Building2;
      case 'owner': return User;
      case 'official': return Briefcase;
    }
  };

  const filteredNodes = useMemo(() => {
    switch (filterType) {
      case 'red_flags':
        return nodes.filter(n => n.hasRedFlag);
      case 'officials':
        return nodes.filter(n => n.type === 'official');
      default:
        return nodes;
    }
  }, [nodes, filterType]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    return edges.filter(e => nodeIds.has(e.source) || nodeIds.has(e.target));
  }, [edges, filteredNodes]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (nodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Mapa de Conexiones
          </CardTitle>
          <CardDescription>
            Visualización de relaciones entre empresas, propietarios y funcionarios
          </CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center">
          <Link2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            No hay datos suficientes para generar el grafo de conexiones.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Mapa de Conexiones
            </CardTitle>
            <CardDescription>
              Visualización de relaciones entre empresas, propietarios y funcionarios
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={filterType === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('all')}
            >
              Todos
            </Button>
            <Button
              variant={filterType === 'red_flags' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('red_flags')}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Con alertas
            </Button>
            <Button
              variant={filterType === 'officials' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('officials')}
            >
              <Briefcase className="h-3 w-3 mr-1" />
              Funcionarios
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative border rounded-lg bg-muted/20 overflow-hidden" style={{ height: 400 }}>
          {/* Zoom controls */}
          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(z + 0.2, 2))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(1)}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Graph SVG */}
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 400 300"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          >
            {/* Edges */}
            {filteredEdges.map((edge, idx) => {
              const sourceNode = filteredNodes.find(n => n.id === edge.source);
              const targetNode = filteredNodes.find(n => n.id === edge.target);
              if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return null;

              return (
                <line
                  key={idx}
                  x1={sourceNode.x}
                  y1={sourceNode.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                  stroke={getEdgeColor(edge.type)}
                  strokeWidth={2}
                  strokeDasharray={edge.type === 'relative' ? '4,4' : undefined}
                />
              );
            })}

            {/* Nodes */}
            {filteredNodes.map(node => {
              const Icon = getNodeIcon(node.type);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => setSelectedNode(node)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    r={20}
                    fill={getNodeColor(node)}
                    stroke={selectedNode?.id === node.id ? 'hsl(var(--foreground))' : 'transparent'}
                    strokeWidth={2}
                  />
                  <foreignObject x={-10} y={-10} width={20} height={20}>
                    <div className="flex items-center justify-center w-full h-full">
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: 'hsl(var(--chart-1))' }} />
            <span>Empresa</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: 'hsl(var(--chart-2))' }} />
            <span>Propietario</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: 'hsl(var(--chart-3))' }} />
            <span>Funcionario</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: 'hsl(var(--destructive))' }} />
            <span>Con alerta</span>
          </div>
        </div>

        {/* Selected node details */}
        {selectedNode && (
          <div className="mt-4 p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              {selectedNode.type === 'company' && <Building2 className="h-4 w-4" />}
              {selectedNode.type === 'owner' && <User className="h-4 w-4" />}
              {selectedNode.type === 'official' && <Briefcase className="h-4 w-4" />}
              <span className="font-medium">{selectedNode.label}</span>
              {selectedNode.hasRedFlag && (
                <Badge variant="destructive" className="text-xs">Con alerta</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Tipo: {selectedNode.type === 'company' ? 'Empresa' : selectedNode.type === 'owner' ? 'Propietario' : 'Funcionario'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
