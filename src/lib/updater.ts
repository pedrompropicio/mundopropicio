import { activatePWAUpdate, subscribeToPWAControllerChange } from "@/lib/pwa";
import { getPendingWorkLabels, subscribePendingWork } from "@/lib/pending-work";
import { isRecoveryInProgress } from "@/lib/passwordRecovery";
import { createUpdater } from "@/lib/update-manager";
import { navigateToBuild, subscribeToNewVersion } from "@/lib/versionCheck";

// Guarda própria da tentativa automática de recuperação de chunk (uma por sessão).
const PRELOAD_RELOAD_KEY = "mp_preload_error_reloaded";

function claimAutoRetry() {
  try {
    if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return false;
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, "1");
  } catch {
    // sessionStorage indisponível — permite a tentativa.
  }
  return true;
}

async function clearCaches() {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignora
  }
}

export const updater = createUpdater({
  getBlockers() {
    const labels = getPendingWorkLabels();
    return isRecoveryInProgress() ? [...labels, "recuperação de senha em curso"] : labels;
  },
  subscribeWork: subscribePendingWork,
  async prepare() {
    // skipWaiting do SW em espera (sem reload) e caches limpas — uma só vez.
    await activatePWAUpdate();
    await clearCaches();
  },
  navigate: navigateToBuild,
  autoReload: () => window.location.reload(),
  claimAutoRetry,
});

let wired = false;

/** Liga os três canais ao actualizador. Idempotente; chamar a partir de main.tsx. */
export function startUpdater() {
  if (wired) return;
  wired = true;

  subscribeToPWAControllerChange(() => updater.signal("sw"));
  subscribeToNewVersion((buildId) => updater.signal("version", buildId));
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    updater.reportChunkError();
  });
}
