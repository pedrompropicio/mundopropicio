import { registerSW } from "virtual:pwa-register";

const PWA_UPDATE_INTERVAL_MS = 60_000;

type ControllerChangeListener = () => void;

const controllerChangeListeners = new Set<ControllerChangeListener>();
let hasPendingControllerChange = false;
let updateSWRef: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function subscribeToPWAControllerChange(listener: ControllerChangeListener) {
  controllerChangeListeners.add(listener);

  if (hasPendingControllerChange) {
    listener();
  }

  return () => {
    controllerChangeListeners.delete(listener);
  };
}

function notifyControllerChange() {
  hasPendingControllerChange = true;
  controllerChangeListeners.forEach((listener) => listener());
}

/** Activa o SW em espera (skipWaiting) SEM recarregar a página. */
export async function activatePWAUpdate() {
  try {
    await updateSWRef?.(false);
  } catch {
    // ignora
  }
}

export function registerPWA() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const hostname = window.location.hostname;
  const isPreviewHost =
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev");
  const serviceWorkerDisabled = new URLSearchParams(window.location.search).get("sw") === "off";

  if (isInIframe || isPreviewHost || serviceWorkerDisabled) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        if (registration.active?.scriptURL.endsWith("/sw.js")) {
          void registration.unregister();
        }
      });
    });
    return;
  }

  // Primeira instalação (sem controller) não é «versão nova».
  const hadController = Boolean(navigator.serviceWorker.controller);

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Há um SW novo em espera: só sinaliza. A activação (skipWaiting) e a
      // navegação acontecem quando o utilizador clica «Atualizar».
      notifyControllerChange();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return;
      }

      const checkForUpdates = () => {
        if (document.visibilityState === "hidden") {
          return;
        }

        void registration.update();
      };

      checkForUpdates();
      window.setInterval(checkForUpdates, PWA_UPDATE_INTERVAL_MS);
      window.addEventListener("focus", checkForUpdates);
      window.addEventListener("pageshow", checkForUpdates);
      document.addEventListener("visibilitychange", checkForUpdates);
    },
    onRegisterError(error) {
      console.error("Erro ao atualizar a aplicação", error);
    },
  });

  updateSWRef = updateSW;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) notifyControllerChange();
  });
}