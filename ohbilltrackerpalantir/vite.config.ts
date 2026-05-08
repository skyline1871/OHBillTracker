import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    // Local dev proxy — avoids CORS issues when developing outside Foundry
    proxy: {
      "/ohio-api": {
        target: "https://search-prod.lis.state.oh.us",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ohio-api/, "/api/v2"),
      },
    },
  },
});
