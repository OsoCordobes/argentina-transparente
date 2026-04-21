<script>
  import { onMount } from 'svelte'

  // Accept raw query results — transformation happens here
  export let empresasData = []   // [{ cuit, nombre, total_monto, tiene_señales }]
  export let directoresData = [] // [{ nombre_director, cuit_empresa }]

  let container
  let hasData = false

  $: validEmpresas = (empresasData ?? []).filter(e => e.cuit && e.cuit !== '_sin_datos_')
  $: validDirectores = (directoresData ?? []).filter(d => d.nombre_director && !d.nombre_director.startsWith('Sin datos'))
  $: hasData = validEmpresas.length > 0 && validDirectores.length > 0

  onMount(async () => {
    if (!hasData || !container) return

    const d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm')

    const width = container.clientWidth || 800
    const height = 520

    const empresaNodes = validEmpresas.map(e => ({
      id: 'emp_' + e.cuit,
      label: e.nombre ?? e.cuit,
      type: 'empresa',
      amount: Number(e.total_monto) || 0,
      flagged: Number(e.tiene_señales) > 0
    }))

    const directorNames = [...new Set(validDirectores.map(d => d.nombre_director))]
    const directorNodes = directorNames.map(nombre => ({
      id: 'dir_' + nombre,
      label: nombre,
      type: 'director',
      amount: 0,
      flagged: false
    }))

    const nodes = [...empresaNodes, ...directorNodes]
    const links = validDirectores
      .filter(d => empresaNodes.some(e => e.id === 'emp_' + d.cuit_empresa))
      .map(d => ({ source: 'dir_' + d.nombre_director, target: 'emp_' + d.cuit_empresa }))

    const maxAmount = Math.max(...empresaNodes.map(n => n.amount), 1)
    const nodeRadius = d => d.type === 'director' ? 6 : 8 + (d.amount / maxAmount) * 20
    const nodeColor = d => d.type === 'director' ? '#9ca3af' : (d.flagged ? '#dc2626' : '#3b82f6')

    const svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(90))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 6))

    const link = svg.append('g').attr('stroke', '#d1d5db').attr('stroke-width', 1.5)
      .selectAll('line').data(links).join('line')

    const node = svg.append('g').selectAll('g').data(nodes).join('g').attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
      )

    node.append('circle').attr('r', nodeRadius).attr('fill', nodeColor).attr('stroke', '#fff').attr('stroke-width', 1.5)
    node.append('text')
      .text(d => d.label.length > 22 ? d.label.slice(0, 20) + '…' : d.label)
      .attr('x', d => nodeRadius(d) + 4).attr('y', '0.35em').attr('fill', '#1f2937').attr('font-size', '10px')
    node.append('title').text(d => d.type === 'empresa' ? `${d.label}\n$${Number(d.amount).toLocaleString()}` : `Director: ${d.label}`)

    simulation.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })
  })
</script>

{#if hasData}
  <div bind:this={container} style="width:100%;min-height:520px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fafafa;"></div>
  <div style="margin-top:8px;font-size:0.8rem;color:#6b7280;display:flex;gap:16px;">
    <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#dc2626;"></span>Empresa con señales</span>
    <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#3b82f6;"></span>Empresa sin señales</span>
    <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#9ca3af;"></span>Director/Socio</span>
  </div>
{:else}
  <div bind:this={container} style="display:none;"></div>
{/if}
