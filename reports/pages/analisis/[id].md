---
title: Expediente de Investigación
---

<Disclaimer />

```sql reporte
select
  id,
  municipio,
  '/red/' || municipio as link_red,
  anio_desde,
  anio_hasta,
  strftime(generado_en::timestamp, '%d/%m/%Y %H:%M') as generado_en_fmt,
  resumen_ejecutivo,
  total_contratos,
  total_señales,
  printf('$%.0f', monto_total) as monto_total_fmt
from argos.reportes
where id = '${params.id}'
```

```sql senales_reporte
select
  tipologia,
  titulo,
  resumen,
  score,
  severidad,
  evidencia_json,
  legal_json
from argos.senales_cache
where municipio = (select municipio from argos.reportes where id = '${params.id}')
order by score desc
```

```sql top_proveedores
select
  '/proveedor/' || substr(proveedor, 1, 80) as link_url,
  proveedor,
  count(*) as contratos,
  printf('$%.0f', sum(monto)) as monto_total,
  printf('%.1f%%', sum(monto) * 100.0 / (select sum(monto) from argos.contratos where municipio = (select municipio from argos.reportes where id = '${params.id}'))) as porcentaje
from argos.contratos
where municipio = (select municipio from argos.reportes where id = '${params.id}')
group by proveedor
order by sum(monto) desc
limit 10
```

```sql por_area
select
  '/area/' || area as link_url,
  area,
  count(*) as contratos,
  printf('$%.0f', sum(monto)) as monto_total,
  count(distinct proveedor) as proveedores_distintos
from argos.contratos
where municipio = (select municipio from argos.reportes where id = '${params.id}')
group by area
order by sum(monto) desc
```

```sql fuentes
select distinct fuente_url
from argos.contratos
where municipio = (select municipio from argos.reportes where id = '${params.id}')
```

{#if reporte.length > 0}

# {reporte[0].municipio} — {reporte[0].anio_desde}–{reporte[0].anio_hasta}

- **Generado:** {reporte[0].generado_en_fmt}
- **Contratos:** {reporte[0].total_contratos}
- **Monto total:** {reporte[0].monto_total_fmt}
- **Señales detectadas:** {reporte[0].total_señales}

<button onclick="window.print()" style="padding:6px 14px;background:#1d4ed8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.875rem;">
  Descargar PDF
</button>

---

## Resumen Ejecutivo

{reporte[0].resumen_ejecutivo}

---

## Señales de Riesgo

<DataTable data={senales_reporte} rows={20}>
  <Column id="severidad" title="Severidad" />
  <Column id="score" title="Score" align="right" />
  <Column id="titulo" title="Señal" />
  <Column id="resumen" title="Descripción" />
</DataTable>

---

## Top Proveedores por Monto

<DataTable data={top_proveedores} rows={10} link="link_url">
  <Column id="proveedor" title="Proveedor" />
  <Column id="contratos" title="Contratos" align="right" />
  <Column id="monto_total" title="Monto Total" align="right" />
  <Column id="porcentaje" title="% del total" align="right" />
</DataTable>

---

## Gasto por Área de Gobierno

<DataTable data={por_area} rows={20} link="link_url">
  <Column id="area" title="Área" />
  <Column id="contratos" title="Contratos" align="right" />
  <Column id="monto_total" title="Monto Total" align="right" />
  <Column id="proveedores_distintos" title="Proveedores" align="right" />
</DataTable>

---

## Fuentes Oficiales

<DataTable data={fuentes} rows={20} />

*Todas las fuentes apuntan al portal oficial de datos abiertos del municipio.*

---

<a href={reporte[0].link_red}>Ver Red de Empresas para {reporte[0].municipio}</a>

{/if}
