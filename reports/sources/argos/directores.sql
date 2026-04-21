select id, cuit_empresa, nombre_director, fuente_url, actualizado_en
from directores
union all
select '_sin_datos_', '_sin_datos_', 'Sin datos IGJ — ejecutar npm run seed:igj', null, null
where (select count(*) from directores) = 0
