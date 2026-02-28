import { defineConfig } from "vite";
import { resolve } from "path";
import { cpSync, existsSync, mkdirSync } from "fs";

function copyExtensionStatic() {
  return {
    name: "copy-extension-static",
    closeBundle() {
      const dist = resolve(__dirname, "dist");
      const stylesTarget = resolve(dist, "content/ui");
      mkdirSync(stylesTarget, { recursive: true });
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
        "content/content.entry": resolve(__dirname, "extension/content/content.entry.ts"),
        popup: resolve(__dirname, "extension/popup/popup.html")
      },
      output: {
        entryFileNames: "[name].js"
      }
    }
  }
});
