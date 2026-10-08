import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  define: { __COLAB_UI_VERSION__: JSON.stringify(readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim()) },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420,
  },
});
