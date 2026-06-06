import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: false,
  },
  // @agocraft/sprite-engine ships its wasm core referenced via
  // `new URL("../wasm/…", import.meta.url)`. esbuild's optimizeDeps pre-bundle
  // mangles that asset path (it resolves to a non-existent .vite/wasm/* → SPA
  // HTML fallback → "expected magic word" CompileError). Excluding the package
  // lets vite serve the dep's real files so the wasm URL resolves + is served
  // as application/wasm. (WI-104)
  optimizeDeps: {
    exclude: ["@agocraft/sprite-engine"],
  },
});
