import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Bee SDK ships a ~8 MB WebAssembly binary (bee_sdk_bg.wasm). For Vite we
// import it as a URL so it is emitted as a static asset and served, then pass
// that URL to bee-sdk's `init({ module_or_path })`.
export default defineConfig({
  plugins: [react()],
  // Async WebAssembly + top-level await are required by bee-sdk (wasm-pack --target web).
  optimizeDeps: { exclude: ["@teamgosh/bee-sdk", "@tvmsdk/lib-web"] },
  server: { port: 5173, headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" } },
  build: { target: "esnext" },
});
