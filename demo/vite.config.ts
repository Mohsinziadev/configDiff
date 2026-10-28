import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { content } from "./content-plugin.ts";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The site consumes the library from source, so the playground always runs the code in this repo.
export default defineConfig({
  root: r("."),
  base: "./",
  plugins: [react(), content()],
  resolve: { alias: [{ find: /^configdiff$/, replacement: r("../src/index.ts") }] },
  server: { fs: { allow: [r("..")] } },
  build: { outDir: r("dist"), emptyOutDir: true },
});
