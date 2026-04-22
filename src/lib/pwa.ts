import { registerSW } from "virtual:pwa-register";

const PWA_UPDATE_INTERVAL_MS = 60_000;

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
  const isPreviewHost = hostname.includes("id-preview--") || hostname.includes("lovableproject.com");

  if (isInIframe || isPreviewHost) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
    return;
  }

  let isRefreshing = false;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Apply updates immediately so users never stay on a stale bundle that is
      // missing newly-added routes (e.g. /relatorios/bp-transacoes). The SW
      // controllerchange handler below will reload the page automatically.
      void updateSW(true);
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

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isRefreshing) {
      return;
    }

    isRefreshing = true;
    window.location.reload();
  });
}