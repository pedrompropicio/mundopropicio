import { registerSW } from "virtual:pwa-register";

const PWA_UPDATE_INTERVAL_MS = 60_000;

export function registerPWA() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  let isRefreshing = false;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
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