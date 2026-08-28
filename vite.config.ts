import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";

const BUILD_ID = String(Date.now());

// Escreve dist/version.json com o mesmo buildId injetado no bundle, para
// permitir deteção de nova versão sem depender do service worker.
const buildVersionPlugin = () => ({
  name: "build-version-json",
  apply: "build" as const,
  closeBundle() {
    fs.mkdirSync("dist", { recursive: true });
    fs.writeFileSync("dist/version.json", JSON.stringify({ buildId: BUILD_ID }));
  },
});

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    buildVersionPlugin(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: {
        enabled: false,
      },
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "MP Gestão Eventos",
        short_name: "MP Gestão",
        description: "Gestão financeira para empresas de eventos, concertos e festivais.",
        theme_color: "#1e3a5f",
        background_color: "#0b1220",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        lang: "pt-PT",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // `navigateFallback: ""` desliga o default do vite-plugin-pwa
        // ("index.html"). Com ele, o workbox registava uma NavigationRoute
        // servida pelo precache (cache-first) ANTES das runtimeCaching, e todas
        // as navegações eram servidas do index.html em cache — era isto que
        // segurava a versão antiga (Safari/PWA). O fallback offline passa a ser
        // feito por `precacheFallback` na rota NetworkFirst abaixo.
        // "html" é obrigatório: o index.html tem de estar no precache para
        // servir de fallback offline.
        navigateFallback: "",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        importScripts: ["/sw-push.js"],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
            handler: "NetworkFirst",
            options: {
              cacheName: "app-navigations",
              networkTimeoutSeconds: 4,
              // Ignora a cache HTTP do browser para o documento: o index.html
              // aponta para os assets com hash e tem de vir sempre fresco.
              fetchOptions: { cache: "reload" } as RequestInit,
              // Offline / rede em falha: cai no index.html do precache.
              precacheFallback: { fallbackURL: "/index.html" },
            },
          },
          {
            urlPattern: ({ request, url, sameOrigin }) =>
              sameOrigin &&
              ["script", "style", "worker"].includes(request.destination) &&
              /-[A-Za-z0-9_-]{8,}\./.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "hashed-assets",
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@radix-ui/react-slot": path.resolve(__dirname, "./node_modules/@radix-ui/react-slot/dist/index.js"),
      "@radix-ui/react-primitive": path.resolve(__dirname, "./node_modules/@radix-ui/react-primitive/dist/index.mjs"),
      "@radix-ui/react-context": path.resolve(__dirname, "./node_modules/@radix-ui/react-context/dist/index.mjs"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@radix-ui/react-slot", "@radix-ui/react-primitive", "@radix-ui/react-context"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
  },
}));
