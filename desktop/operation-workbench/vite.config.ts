import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  base: "/operation-workbench/", plugins: [react(), tailwindcss()],
  resolve: { alias: [{find:"./trace-operations",replacement:new URL("./src/trace-operations.ts",import.meta.url).pathname},{find:"@",replacement:new URL("../ui/src",import.meta.url).pathname}], dedupe: ["react", "react-dom"] },
  define: {
    __WORKBENCH_VERSION__: JSON.stringify(process.env.COLAB_WORKBENCH_VERSION || readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim()),
    __COLAB_ARTIFACT_CONFIG__: readFileSync(process.env.COLAB_ARTIFACT_CONFIG || new URL("../../packaging/artifact-config.local.json", import.meta.url), "utf8"),
  },
});
