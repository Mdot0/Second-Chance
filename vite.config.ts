import { defineConfig } from "vite";
import { resolve } from "path";
import { cpSync, existsSync, mkdirSync } from "fs";
import { build as esbuildBuild } from "esbuild";

function copyExtensionStatic() {
  return {
    name: "copy-extension-static",
    async closeBundle() {
      const dist = resolve(__dirname, "dist");
      const contentTarget = resolve(dist, "content");
      const stylesTarget = resolve(dist, "content/ui");
      mkdirSync(contentTarget, { recursive: true });
      mkdirSync(stylesTarget, { recursive: true });

      // Chrome content scripts are classic scripts, so bundle as IIFE (no import/export).
      await esbuildBuild({
        entryPoints: [resolve(__dirname, "extension/content/content.entry.ts")],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "chrome114",
        minify: true,
        outfile: resolve(contentTarget, "content.entry.js")
      });

      cpSync(resolve(__dirname, "extension/manifest.json"), resolve(dist, "manifest.json"));
      cpSync(resolve(__dirname, "extension/content/ui/styles.css"), resolve(stylesTarget, "styles.css"));

      const iconsSrc = resolve(__dirname, "extension/assets/icons");
      if (existsSync(iconsSrc)) {
        const iconsDist = resolve(dist, "assets/icons");
        mkdirSync(iconsDist, { recursive: true });
        cpSync(iconsSrc, iconsDist, { recursive: true });
      }
    }
  };
}

export default defineConfig({
  root: "extension",
  plugins: [copyExtensionStatic()],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "extension/popup/popup.html")
      },
      output: {
        entryFileNames: "[name].js"
      }
    }
  }
});
