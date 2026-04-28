import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // DuckDB single-writer: tests que llaman initDb() corren contra el mismo
    // archivo data/argos.duckdb. Forzamos ejecución de archivos secuencial
    // para evitar races de lock entre, por ejemplo, identity-resolver.test.ts
    // y snapshots.test.ts.
    fileParallelism: false,
  },
})
