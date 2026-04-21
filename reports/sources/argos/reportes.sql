select
  id,
  municipio,
  anio_desde,
  anio_hasta,
  generado_en,
  resumen_ejecutivo,
  total_contratos,
  total_señales,
  json_extract(expediente_json, '$.datosBase.montoTotal')::double as monto_total,
  json_extract_string(expediente_json, '$.guiaDenuncia') as guia_denuncia_json,
  expediente_json
from reportes
