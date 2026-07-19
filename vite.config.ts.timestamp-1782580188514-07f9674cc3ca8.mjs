// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Users/Admin/Downloads/airy-page-start-cbf2b60e-main/airy-page-start-cbf2b60e-main/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Admin/Downloads/airy-page-start-cbf2b60e-main/airy-page-start-cbf2b60e-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/Admin/Downloads/airy-page-start-cbf2b60e-main/airy-page-start-cbf2b60e-main/node_modules/lovable-tagger/dist/index.js";
import { VitePWA } from "file:///C:/Users/Admin/Downloads/airy-page-start-cbf2b60e-main/airy-page-start-cbf2b60e-main/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\Admin\\Downloads\\airy-page-start-cbf2b60e-main\\airy-page-start-cbf2b60e-main";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxBZG1pblxcXFxEb3dubG9hZHNcXFxcYWlyeS1wYWdlLXN0YXJ0LWNiZjJiNjBlLW1haW5cXFxcYWlyeS1wYWdlLXN0YXJ0LWNiZjJiNjBlLW1haW5cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXEFkbWluXFxcXERvd25sb2Fkc1xcXFxhaXJ5LXBhZ2Utc3RhcnQtY2JmMmI2MGUtbWFpblxcXFxhaXJ5LXBhZ2Utc3RhcnQtY2JmMmI2MGUtbWFpblxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvQWRtaW4vRG93bmxvYWRzL2FpcnktcGFnZS1zdGFydC1jYmYyYjYwZS1tYWluL2FpcnktcGFnZS1zdGFydC1jYmYyYjYwZS1tYWluL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSBcInZpdGUtcGx1Z2luLXB3YVwiO1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksIFwiXCIpO1xuICBjb25zdCBzdXBhYmFzZVVybCA9IGVudi5WSVRFX1NVUEFCQVNFX1VSTCB8fCBcImh0dHBzOi8vcGh5YnhheGJpb3h2eHZ3aXJpeGsuc3VwYWJhc2UuY29cIjtcbiAgY29uc3Qgc3VwYWJhc2VQdWJsaXNoYWJsZUtleSA9IGVudi5WSVRFX1NVUEFCQVNFX1BVQkxJU0hBQkxFX0tFWSB8fCBcInNiX3B1Ymxpc2hhYmxlX2Uya3VvYzI3cU9DZVJNcnZCSEc4TUFfaXhGWkVudElcIjtcbiAgY29uc3Qgc3VwYWJhc2VQcm9qZWN0SWQgPSBlbnYuVklURV9TVVBBQkFTRV9QUk9KRUNUX0lEIHx8IFwicGh5YnhheGJpb3h2eHZ3aXJpeGtcIjtcblxuICByZXR1cm4ge1xuICAgIHNlcnZlcjoge1xuICAgICAgaG9zdDogXCI6OlwiLFxuICAgICAgcG9ydDogODA4MCxcbiAgICB9LFxuICAgIGRlZmluZToge1xuICAgICAgXCJpbXBvcnQubWV0YS5lbnYuVklURV9TVVBBQkFTRV9VUkxcIjogSlNPTi5zdHJpbmdpZnkoc3VwYWJhc2VVcmwpLFxuICAgICAgXCJpbXBvcnQubWV0YS5lbnYuVklURV9TVVBBQkFTRV9QVUJMSVNIQUJMRV9LRVlcIjogSlNPTi5zdHJpbmdpZnkoc3VwYWJhc2VQdWJsaXNoYWJsZUtleSksXG4gICAgICBcImltcG9ydC5tZXRhLmVudi5WSVRFX1NVUEFCQVNFX1BST0pFQ1RfSURcIjogSlNPTi5zdHJpbmdpZnkoc3VwYWJhc2VQcm9qZWN0SWQpLFxuICAgIH0sXG4gICAgcGx1Z2luczogW1xuICAgICAgcmVhY3QoKSxcbiAgICAgIG1vZGUgPT09ICdkZXZlbG9wbWVudCcgJiYgY29tcG9uZW50VGFnZ2VyKCksXG4gICAgICBWaXRlUFdBKHtcbiAgICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXG4gICAgICAgIG1hbmlmZXN0OiBmYWxzZSxcbiAgICAgICAgd29ya2JveDoge1xuICAgICAgICAgIG1heGltdW1GaWxlU2l6ZVRvQ2FjaGVJbkJ5dGVzOiA1MDAwMDAwLFxuICAgICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxpY28scG5nLHN2Zyxqc29ufSddXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgXS5maWx0ZXIoQm9vbGVhbiksXG4gICAgcmVzb2x2ZToge1xuICAgICAgYWxpYXM6IHtcbiAgICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgYnVpbGQ6IHtcbiAgICAgIHRhcmdldDogJ2VzMjAyMCcsXG4gICAgICBtaW5pZnk6ICd0ZXJzZXInLFxuICAgICAgdGVyc2VyT3B0aW9uczoge1xuICAgICAgICBjb21wcmVzczoge1xuICAgICAgICAgIGRyb3BfY29uc29sZTogdHJ1ZSxcbiAgICAgICAgICBkcm9wX2RlYnVnZ2VyOiB0cnVlLFxuICAgICAgICAgIHB1cmVfZnVuY3M6IFsnY29uc29sZS5sb2cnLCAnY29uc29sZS5pbmZvJywgJ2NvbnNvbGUuZGVidWcnXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgIG91dHB1dDoge1xuICAgICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgICAgJ3ZlbmRvci1yZWFjdCc6IFsncmVhY3QnLCAncmVhY3QtZG9tJywgJ3JlYWN0LXJvdXRlci1kb20nXSxcbiAgICAgICAgICAgICd2ZW5kb3ItdWknOiBbJ0ByYWRpeC11aS9yZWFjdC1kaWFsb2cnLCAnQHJhZGl4LXVpL3JlYWN0LXBvcG92ZXInLCAnQHJhZGl4LXVpL3JlYWN0LXNlbGVjdCcsICdAcmFkaXgtdWkvcmVhY3QtdGFicycsICdAcmFkaXgtdWkvcmVhY3QtdG9vbHRpcCcsICdAcmFkaXgtdWkvcmVhY3QtZHJvcGRvd24tbWVudSddLFxuICAgICAgICAgICAgJ3ZlbmRvci1jaGFydHMnOiBbJ3JlY2hhcnRzJ10sXG4gICAgICAgICAgICAndmVuZG9yLXN1cGFiYXNlJzogWydAc3VwYWJhc2Uvc3VwYWJhc2UtanMnXSxcbiAgICAgICAgICAgICd2ZW5kb3ItdXRpbHMnOiBbJ2RhdGUtZm5zJywgJ3pvZCcsICdjbHN4JywgJ3RhaWx3aW5kLW1lcmdlJywgJ2NsYXNzLXZhcmlhbmNlLWF1dGhvcml0eSddLFxuICAgICAgICAgICAgJ3ZlbmRvci1iYXJjb2RlJzogWydqc2JhcmNvZGUnLCAnaHRtbDUtcXJjb2RlJywgJ3FyY29kZS5yZWFjdCddLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA1MDAsXG4gICAgfSxcbiAgfTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEwYixTQUFTLGNBQWMsZUFBZTtBQUNoZSxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUp4QixJQUFNLG1DQUFtQztBQU96QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFDM0MsUUFBTSxjQUFjLElBQUkscUJBQXFCO0FBQzdDLFFBQU0seUJBQXlCLElBQUksaUNBQWlDO0FBQ3BFLFFBQU0sb0JBQW9CLElBQUksNEJBQTRCO0FBRTFELFNBQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxJQUNSO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixxQ0FBcUMsS0FBSyxVQUFVLFdBQVc7QUFBQSxNQUMvRCxpREFBaUQsS0FBSyxVQUFVLHNCQUFzQjtBQUFBLE1BQ3RGLDRDQUE0QyxLQUFLLFVBQVUsaUJBQWlCO0FBQUEsSUFDOUU7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLFNBQVMsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQzFDLFFBQVE7QUFBQSxRQUNOLGNBQWM7QUFBQSxRQUNkLFVBQVU7QUFBQSxRQUNWLFNBQVM7QUFBQSxVQUNQLCtCQUErQjtBQUFBLFVBQy9CLGNBQWMsQ0FBQyxxQ0FBcUM7QUFBQSxRQUN0RDtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0gsRUFBRSxPQUFPLE9BQU87QUFBQSxJQUNoQixTQUFTO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsTUFDdEM7QUFBQSxJQUNGO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUixRQUFRO0FBQUEsTUFDUixlQUFlO0FBQUEsUUFDYixVQUFVO0FBQUEsVUFDUixjQUFjO0FBQUEsVUFDZCxlQUFlO0FBQUEsVUFDZixZQUFZLENBQUMsZUFBZSxnQkFBZ0IsZUFBZTtBQUFBLFFBQzdEO0FBQUEsTUFDRjtBQUFBLE1BQ0EsZUFBZTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFVBQ04sY0FBYztBQUFBLFlBQ1osZ0JBQWdCLENBQUMsU0FBUyxhQUFhLGtCQUFrQjtBQUFBLFlBQ3pELGFBQWEsQ0FBQywwQkFBMEIsMkJBQTJCLDBCQUEwQix3QkFBd0IsMkJBQTJCLCtCQUErQjtBQUFBLFlBQy9LLGlCQUFpQixDQUFDLFVBQVU7QUFBQSxZQUM1QixtQkFBbUIsQ0FBQyx1QkFBdUI7QUFBQSxZQUMzQyxnQkFBZ0IsQ0FBQyxZQUFZLE9BQU8sUUFBUSxrQkFBa0IsMEJBQTBCO0FBQUEsWUFDeEYsa0JBQWtCLENBQUMsYUFBYSxnQkFBZ0IsY0FBYztBQUFBLFVBQ2hFO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLHVCQUF1QjtBQUFBLElBQ3pCO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
