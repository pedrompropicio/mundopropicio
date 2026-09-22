import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerPWA } from "@/lib/pwa";
import { startVersionCheck } from "@/lib/versionCheck";
import "./index.css";

// Chunk desactualizado depois de um Publish: os hashes mudaram debaixo de um
// separador já aberto e o import dinâmico falha ("Failed to fetch dynamically
// imported module"). Recarrega UMA única vez por sessão. Guarda própria (não o
// claimReloadGuard do versionCheck) para não bloquear o recarregamento por nova
// versão nem ser bloqueada por ele.
const PRELOAD_RELOAD_KEY = "mp_preload_error_reloaded";
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return;
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, "1");
  } catch {
    // sessionStorage indisponível — segue em frente.
  }
  window.location.reload();
});

registerPWA();
startVersionCheck();

createRoot(document.getElementById("root")!).render(<App />);
