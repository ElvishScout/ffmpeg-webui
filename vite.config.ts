/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// Local equivalent of the /assets/*.wasm.br rule in public/_headers, so
// `vite preview` smoke-tests match what Cloudflare serves.
const wasmBrHeaders: Plugin = {
  name: "wasm-br-headers",
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.endsWith(".wasm.br")) {
        res.setHeader("Content-Type", "application/wasm");
        res.setHeader("Content-Encoding", "br");
      }
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss(), wasmBrHeaders],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  build: {
    // never inline assets as data: URIs — a classic Worker cannot load one
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/core-mt"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
