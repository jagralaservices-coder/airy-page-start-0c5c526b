// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Users/Admin/Downloads/airy-page-start-5e0080ed-main/airy-page-start-5e0080ed-main/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Admin/Downloads/airy-page-start-5e0080ed-main/airy-page-start-5e0080ed-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/Admin/Downloads/airy-page-start-5e0080ed-main/airy-page-start-5e0080ed-main/node_modules/lovable-tagger/dist/index.js";
import { VitePWA } from "file:///C:/Users/Admin/Downloads/airy-page-start-5e0080ed-main/airy-page-start-5e0080ed-main/node_modules/vite-plugin-pwa/dist/index.js";
import basicSsl from "file:///C:/Users/Admin/Downloads/airy-page-start-5e0080ed-main/airy-page-start-5e0080ed-main/node_modules/@vitejs/plugin-basic-ssl/dist/index.mjs";
var __vite_injected_original_dirname = "C:\\Users\\Admin\\Downloads\\airy-page-start-5e0080ed-main\\airy-page-start-5e0080ed-main";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL || "https://phybxaxbioxvxvwirixk.supabase.co";
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_e2kuoc27qOCeRMrvBHG8MA_ixFZEntI";
  const supabaseProjectId = env.VITE_SUPABASE_PROJECT_ID || "phybxaxbioxvxvwirixk";
  return {
    server: {
      host: "::",
      port: 8080
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId)
    },
    plugins: [
      basicSsl(),
      react(),
      mode === "development" && componentTagger(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: false,
        workbox: {
          maximumFileSizeToCacheInBytes: 5e6,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"]
        }
      })
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    },
    build: {
      target: "es2020",
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ["console.log", "console.info", "console.debug"]
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-popover", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-tooltip", "@radix-ui/react-dropdown-menu"],
            "vendor-charts": ["recharts"],
            "vendor-supabase": ["@supabase/supabase-js"],
            "vendor-utils": ["date-fns", "zod", "clsx", "tailwind-merge", "class-variance-authority"],
            "vendor-barcode": ["jsbarcode", "html5-qrcode", "qrcode.react"]
          }
        }
      },
      chunkSizeWarningLimit: 500
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxBZG1pblxcXFxEb3dubG9hZHNcXFxcYWlyeS1wYWdlLXN0YXJ0LTVlMDA4MGVkLW1haW5cXFxcYWlyeS1wYWdlLXN0YXJ0LTVlMDA4MGVkLW1haW5cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXEFkbWluXFxcXERvd25sb2Fkc1xcXFxhaXJ5LXBhZ2Utc3RhcnQtNWUwMDgwZWQtbWFpblxcXFxhaXJ5LXBhZ2Utc3RhcnQtNWUwMDgwZWQtbWFpblxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvQWRtaW4vRG93bmxvYWRzL2FpcnktcGFnZS1zdGFydC01ZTAwODBlZC1tYWluL2FpcnktcGFnZS1zdGFydC01ZTAwODBlZC1tYWluL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSBcInZpdGUtcGx1Z2luLXB3YVwiO1xuaW1wb3J0IGJhc2ljU3NsIGZyb20gXCJAdml0ZWpzL3BsdWdpbi1iYXNpYy1zc2xcIjtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+IHtcbiAgY29uc3QgZW52ID0gbG9hZEVudihtb2RlLCBwcm9jZXNzLmN3ZCgpLCBcIlwiKTtcbiAgY29uc3Qgc3VwYWJhc2VVcmwgPSBlbnYuVklURV9TVVBBQkFTRV9VUkwgfHwgXCJodHRwczovL3BoeWJ4YXhiaW94dnh2d2lyaXhrLnN1cGFiYXNlLmNvXCI7XG4gIGNvbnN0IHN1cGFiYXNlUHVibGlzaGFibGVLZXkgPSBlbnYuVklURV9TVVBBQkFTRV9QVUJMSVNIQUJMRV9LRVkgfHwgXCJzYl9wdWJsaXNoYWJsZV9lMmt1b2MyN3FPQ2VSTXJ2QkhHOE1BX2l4RlpFbnRJXCI7XG4gIGNvbnN0IHN1cGFiYXNlUHJvamVjdElkID0gZW52LlZJVEVfU1VQQUJBU0VfUFJPSkVDVF9JRCB8fCBcInBoeWJ4YXhiaW94dnh2d2lyaXhrXCI7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIGhvc3Q6IFwiOjpcIixcbiAgICAgIHBvcnQ6IDgwODAsXG4gICAgfSxcbiAgICBkZWZpbmU6IHtcbiAgICAgIFwiaW1wb3J0Lm1ldGEuZW52LlZJVEVfU1VQQUJBU0VfVVJMXCI6IEpTT04uc3RyaW5naWZ5KHN1cGFiYXNlVXJsKSxcbiAgICAgIFwiaW1wb3J0Lm1ldGEuZW52LlZJVEVfU1VQQUJBU0VfUFVCTElTSEFCTEVfS0VZXCI6IEpTT04uc3RyaW5naWZ5KHN1cGFiYXNlUHVibGlzaGFibGVLZXkpLFxuICAgICAgXCJpbXBvcnQubWV0YS5lbnYuVklURV9TVVBBQkFTRV9QUk9KRUNUX0lEXCI6IEpTT04uc3RyaW5naWZ5KHN1cGFiYXNlUHJvamVjdElkKSxcbiAgICB9LFxuICAgIHBsdWdpbnM6IFtcbiAgICAgIGJhc2ljU3NsKCksXG4gICAgICByZWFjdCgpLFxuICAgICAgbW9kZSA9PT0gJ2RldmVsb3BtZW50JyAmJiBjb21wb25lbnRUYWdnZXIoKSxcbiAgICAgIFZpdGVQV0Eoe1xuICAgICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcbiAgICAgICAgbWFuaWZlc3Q6IGZhbHNlLFxuICAgICAgICB3b3JrYm94OiB7XG4gICAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDUwMDAwMDAsXG4gICAgICAgICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnLGpzb259J11cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICBdLmZpbHRlcihCb29sZWFuKSxcbiAgICByZXNvbHZlOiB7XG4gICAgICBhbGlhczoge1xuICAgICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBidWlsZDoge1xuICAgICAgdGFyZ2V0OiAnZXMyMDIwJyxcbiAgICAgIG1pbmlmeTogJ3RlcnNlcicsXG4gICAgICB0ZXJzZXJPcHRpb25zOiB7XG4gICAgICAgIGNvbXByZXNzOiB7XG4gICAgICAgICAgZHJvcF9jb25zb2xlOiB0cnVlLFxuICAgICAgICAgIGRyb3BfZGVidWdnZXI6IHRydWUsXG4gICAgICAgICAgcHVyZV9mdW5jczogWydjb25zb2xlLmxvZycsICdjb25zb2xlLmluZm8nLCAnY29uc29sZS5kZWJ1ZyddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgICAgb3V0cHV0OiB7XG4gICAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgICAndmVuZG9yLXJlYWN0JzogWydyZWFjdCcsICdyZWFjdC1kb20nLCAncmVhY3Qtcm91dGVyLWRvbSddLFxuICAgICAgICAgICAgJ3ZlbmRvci11aSc6IFsnQHJhZGl4LXVpL3JlYWN0LWRpYWxvZycsICdAcmFkaXgtdWkvcmVhY3QtcG9wb3ZlcicsICdAcmFkaXgtdWkvcmVhY3Qtc2VsZWN0JywgJ0ByYWRpeC11aS9yZWFjdC10YWJzJywgJ0ByYWRpeC11aS9yZWFjdC10b29sdGlwJywgJ0ByYWRpeC11aS9yZWFjdC1kcm9wZG93bi1tZW51J10sXG4gICAgICAgICAgICAndmVuZG9yLWNoYXJ0cyc6IFsncmVjaGFydHMnXSxcbiAgICAgICAgICAgICd2ZW5kb3Itc3VwYWJhc2UnOiBbJ0BzdXBhYmFzZS9zdXBhYmFzZS1qcyddLFxuICAgICAgICAgICAgJ3ZlbmRvci11dGlscyc6IFsnZGF0ZS1mbnMnLCAnem9kJywgJ2Nsc3gnLCAndGFpbHdpbmQtbWVyZ2UnLCAnY2xhc3MtdmFyaWFuY2UtYXV0aG9yaXR5J10sXG4gICAgICAgICAgICAndmVuZG9yLWJhcmNvZGUnOiBbJ2pzYmFyY29kZScsICdodG1sNS1xcmNvZGUnLCAncXJjb2RlLnJlYWN0J10sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDUwMCxcbiAgICB9LFxuICB9O1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTBiLFNBQVMsY0FBYyxlQUFlO0FBQ2hlLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLE9BQU8sY0FBYztBQUxyQixJQUFNLG1DQUFtQztBQVF6QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFDM0MsUUFBTSxjQUFjLElBQUkscUJBQXFCO0FBQzdDLFFBQU0seUJBQXlCLElBQUksaUNBQWlDO0FBQ3BFLFFBQU0sb0JBQW9CLElBQUksNEJBQTRCO0FBRTFELFNBQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxJQUNSO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixxQ0FBcUMsS0FBSyxVQUFVLFdBQVc7QUFBQSxNQUMvRCxpREFBaUQsS0FBSyxVQUFVLHNCQUFzQjtBQUFBLE1BQ3RGLDRDQUE0QyxLQUFLLFVBQVUsaUJBQWlCO0FBQUEsSUFDOUU7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLFNBQVMsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQzFDLFFBQVE7QUFBQSxRQUNOLGNBQWM7QUFBQSxRQUNkLFVBQVU7QUFBQSxRQUNWLFNBQVM7QUFBQSxVQUNQLCtCQUErQjtBQUFBLFVBQy9CLGNBQWMsQ0FBQyxxQ0FBcUM7QUFBQSxRQUN0RDtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0gsRUFBRSxPQUFPLE9BQU87QUFBQSxJQUNoQixTQUFTO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsTUFDdEM7QUFBQSxJQUNGO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUixRQUFRO0FBQUEsTUFDUixlQUFlO0FBQUEsUUFDYixVQUFVO0FBQUEsVUFDUixjQUFjO0FBQUEsVUFDZCxlQUFlO0FBQUEsVUFDZixZQUFZLENBQUMsZUFBZSxnQkFBZ0IsZUFBZTtBQUFBLFFBQzdEO0FBQUEsTUFDRjtBQUFBLE1BQ0EsZUFBZTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFVBQ04sY0FBYztBQUFBLFlBQ1osZ0JBQWdCLENBQUMsU0FBUyxhQUFhLGtCQUFrQjtBQUFBLFlBQ3pELGFBQWEsQ0FBQywwQkFBMEIsMkJBQTJCLDBCQUEwQix3QkFBd0IsMkJBQTJCLCtCQUErQjtBQUFBLFlBQy9LLGlCQUFpQixDQUFDLFVBQVU7QUFBQSxZQUM1QixtQkFBbUIsQ0FBQyx1QkFBdUI7QUFBQSxZQUMzQyxnQkFBZ0IsQ0FBQyxZQUFZLE9BQU8sUUFBUSxrQkFBa0IsMEJBQTBCO0FBQUEsWUFDeEYsa0JBQWtCLENBQUMsYUFBYSxnQkFBZ0IsY0FBYztBQUFBLFVBQ2hFO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLHVCQUF1QjtBQUFBLElBQ3pCO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
