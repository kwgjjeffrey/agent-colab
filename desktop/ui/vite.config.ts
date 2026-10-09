import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const artifactConfig = JSON.parse(readFileSync(process.env.COLAB_ARTIFACT_CONFIG || new URL("../../packaging/artifact-config.local.json", import.meta.url), "utf8"));
export default defineConfig({
  base: "./",
  define: { __COLAB_ARTIFACT_CONFIG__: JSON.stringify(artifactConfig), __COLAB_UI_VERSION__: JSON.stringify(process.env.COLAB_DESKTOP_UI_VERSION || readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim()) },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420,
  },
});
