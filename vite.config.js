import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const appVersion = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;
if (typeof appVersion !== "string" || appVersion.trim().length === 0) {
  throw new Error("A valid app version is required in package.json.");
}

mkdirSync(new URL("./public/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./public/app-update.json", import.meta.url),
  `${JSON.stringify({ version: appVersion, url: "https://focus-to-work.vercel.app/" }, null, 2)}\n`,
  "utf8",
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "manifest.webmanifest", "robots.txt", "sitemap.xml"],
      manifest: false,
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/.*\\.(?:apk|dmg|msi|exe|appimage)$/i],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,json,svg,png,mp3,txt,webmanifest,ico}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(?:[^./]+\.)*mp3quran\.net\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "quran-stream-cache",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
