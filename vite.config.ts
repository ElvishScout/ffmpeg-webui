/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
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
