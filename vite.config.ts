import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL || "https://phybxaxbioxvxvwirixk.supabase.co";
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_e2kuoc27qOCeRMrvBHG8MA_ixFZEntI";
  const supabaseProjectId = env.VITE_SUPABASE_PROJECT_ID || "phybxaxbioxvxvwirixk";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    },
    plugins: [
      basicSsl(),
      react(),
      mode === 'development' && componentTagger(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false,
        workbox: {
          maximumFileSizeToCacheInBytes: 5000000,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}']
        }
      })
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      target: 'es2020',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-dropdown-menu'],
            'vendor-charts': ['recharts'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-utils': ['date-fns', 'zod', 'clsx', 'tailwind-merge', 'class-variance-authority'],
            'vendor-barcode': ['jsbarcode', 'html5-qrcode', 'qrcode.react'],
          },
        },
      },
      chunkSizeWarningLimit: 500,
    },
  };
});
