import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import { execSync } from "child_process";

const BUILD_AT = new Date();
const BUILD_ID = String(BUILD_AT.getTime());

// Commit publicado: serve para confirmar, depois de um Publish, que o que está
// em produção é de facto o HEAD publicado. Nunca pode fazer o build falhar.
function resolveCommit(): string | null {
  try {
    const sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (sha) return sha;
  } catch {
    // sem git disponível — segue para as variáveis de ambiente
  }
  return (
    process.env.VITE_COMMIT_SHA || process.env.COMMIT_REF || process.env.GIT_COMMIT || null
  );
}

// Escreve dist/version.json com o mesmo buildId injetado no bundle, para
// permitir deteção de nova versão sem depender do service worker.
// `buildId` é o campo que src/lib/versionCheck.ts compara — não mudar o nome.
const buildVersionPlugin = () => ({
  name: "build-version-json",
  apply: "build" as const,
  closeBundle() {
    fs.mkdirSync("dist", { recursive: true });
    fs.writeFileSync(
      "dist/version.json",
      JSON.stringify({
        buildId: BUILD_ID,
        builtAt: BUILD_AT.toISOString(),
        commit: resolveCommit(),
      }),
    );
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
  build: {
    rollupOptions: {
      output: {
        // Só pacotes que existem no package.json. React NÃO é partido em dois
        // chunks (ver alias/dedupe abaixo).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@tanstack)\//.test(id)) {
            return "vendor-react";
          }
          if (/node_modules\/(@radix-ui|lucide-react)\//.test(id)) return "vendor-ui";
          if (/node_modules\/(handsontable|@handsontable|hyperformula)\//.test(id)) {
            return "vendor-handsontable";
          }
          if (/node_modules\/(jspdf|jspdf-autotable)\//.test(id)) return "vendor-pdf";
          if (/node_modules\/(xlsx|exceljs)\//.test(id)) return "vendor-xlsx";
          if (/node_modules\/(recharts|d3-|internmap|victory-vendor)/.test(id)) return "vendor-charts";
          if (/node_modules\/@supabase\//.test(id)) return "vendor-supabase";
        },
      },
    },
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
        // O chunk principal já passou os 10 MiB (2026-09-22) e o workbox
        // rebentava o build na geração do service worker. Limite subido para
        // 24 MiB para dar folga ao bundle actual.
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
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
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
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
