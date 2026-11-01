import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerPWA } from "@/lib/pwa";
import { startUpdater } from "@/lib/updater";
import { startVersionCheck } from "@/lib/versionCheck";
import "./index.css";

// Service worker, version.json e vite:preloadError (chunk desactualizado depois
// de um Publish) convergem no actualizador (src/lib/updater.ts): nada recarrega
// sem clique, salvo uma tentativa automática por sessão sem trabalho pendente.
startUpdater();

registerPWA();
startVersionCheck();

createRoot(document.getElementById("root")!).render(<App />);
