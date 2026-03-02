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
      const backgroundTarget = resolve(dist, "background");
      const offscreenTarget = resolve(dist, "offscreen");
      mkdirSync(contentTarget, { recursive: true });
      mkdirSync(stylesTarget, { recursive: true });
      mkdirSync(backgroundTarget, { recursive: true });
      mkdirSync(offscreenTarget, { recursive: true });

      // Chrome content scripts are classic scripts, so bundle as IIFE (no import/export).
      await esbuildBuild({
        entryPoints: [
          resolve(__dirname, "extension/content/content.entry.ts"),
          resolve(__dirname, "extension/content/outlook.entry.ts")
        ],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "chrome114",
        minify: true,
        outdir: contentTarget,
        entryNames: "[name]"
      });

      // Background service worker — IIFE, registers listeners on execution.
      await esbuildBuild({
        entryPoints: [resolve(__dirname, "extension/background/background.ts")],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "chrome116",
        minify: true,
        outfile: resolve(backgroundTarget, "background.js")
      });

      // Offscreen document — ESM so WebLLM's dynamic imports are preserved correctly.
      // `url` is marked external because WebLLM's bundle contains a dead Node.js branch
      // (`typeof process !== 'undefined' ? require('url') : ...`) that esbuild tries to
      // resolve even though it never executes in the browser.
      await esbuildBuild({
        entryPoints: [resolve(__dirname, "extension/offscreen/offscreen.ts")],
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "chrome116",
        minify: true,
        external: ["url"],
        outfile: resolve(offscreenTarget, "offscreen.js")
      });

      cpSync(resolve(__dirname, "extension/manifest.json"), resolve(dist, "manifest.json"));
      cpSync(resolve(__dirname, "extension/content/ui/styles.css"), resolve(stylesTarget, "styles.css"));
      cpSync(
        resolve(__dirname, "extension/offscreen/offscreen.html"),
        resolve(offscreenTarget, "offscreen.html")
      );

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
