import { memo }              from 'react'
import { Handle, Position }  from '@xyflow/react'
import { Building2, User, FileText } from 'lucide-react'
import { useBoardStore }     from '@/store/useBoardStore'

interface EntityNodeData {
  label:      string
  entityType: string
  entityId:   string
}

const COLORS: Record<string, string> = {
  Empresa:  'bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700',
  Persona:  'bg-emerald-50 border-emerald-300 dark:bg-emerald-950 dark:border-emerald-700',
  Contrato: 'bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700',
}

const ICONS: Record<string, typeof Building2> = {
  Empresa:  Building2,
  Persona:  User,
  Contrato: FileText,
}

function EntityNode({ data, selected }: { data: EntityNodeData; selected?: boolean }) {
  const { selectNode } = useBoardStore()
  const colorClass = COLORS[data.entityType] ?? 'bg-secondary border-border'
  const Icon       = ICONS[data.entityType] ?? FileText

  return (
    <div
      className={`
        rounded-lg border-2 px-3 py-2 shadow-sm cursor-pointer min-w-[140px] max-w-[200px]
        ${colorClass}
        ${selected ? 'ring-2 ring-primary ring-offset-1' : ''}
        transition-all hover:shadow-md
      `}
      onClick={() => selectNode(data.entityId)}
    >
      <Handle type="target" position={Position.Top}    className="!bg-muted-foreground" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />

      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
          {data.entityType}
        </span>
      </div>
      <p className="text-xs font-semibold leading-tight break-words">
        {data.label.length > 40 ? data.label.slice(0, 38) + '…' : data.label}
      </p>
    </div>
  )
}

export default memo(EntityNode)
