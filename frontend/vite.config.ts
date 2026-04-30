import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "node:child_process";
import { componentTagger } from "lovable-tagger";

// Commit hash corto inyectado en build (sidebar brand line "v3.0 · <hash>").
// Fallback 'dev' si git no está disponible o no es repo.
function getCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_COMMIT_HASH": JSON.stringify(getCommitHash()),
  },
  build: {
    // Vendor chunks separados para mejor cache cross-deploy.
    // Cytoscape va en su propio chunk y sólo se descarga al navegar a /red.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'react-query': ['@tanstack/react-query', '@tanstack/react-table'],
          cytoscape: ['cytoscape', 'cytoscape-dagre', 'react-cytoscapejs', 'dagre'],
          'd3-force': ['d3-force', 'd3-quadtree', 'd3-dispatch', 'd3-timer'],
          recharts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
          radix: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },
    // Ya hicimos code splitting por ruta + manualChunks; subimos el warning
    // limit para reflejar el nuevo target real.
    chunkSizeWarningLimit: 600,
  },
}));

