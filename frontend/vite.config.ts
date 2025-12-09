import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // Allow K8s pods to connect via host.docker.internal
    allowedHosts: ["host.docker.internal", ".scaledtest.local"],
    watch: {
      usePolling: true,
    },
    proxy: {
      // gRPC-Web endpoints (Connect protocol uses /package.Service/Method paths)
      "^/api\\.v1\\..+": {
        target: process.env.VITE_API_URL || "http://localhost:8080",
        changeOrigin: true,
      },
      // Legacy REST API proxy (if any)
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "chart-vendor": ["recharts"],
        },
      },
    },
  },
  // Vitest configuration for unit testing
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: ["node_modules", "dist", "tests/**/*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/__tests__/",
        "**/*.d.ts",
        "**/*.test.*",
        "**/*.spec.*",
      ],
    },
  },
});
