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
      // Only auto-apply the update when the tab is hidden (user not actively working).
      // If active, postpone until the next visibility-hidden transition.
      if (document.visibilityState === "hidden") {
        void updateSW(true);
      } else {
        const applyWhenHidden = () => {
          if (document.visibilityState === "hidden") {
            document.removeEventListener("visibilitychange", applyWhenHidden);
            void updateSW(true);
          }
        };
        document.addEventListener("visibilitychange", applyWhenHidden);
      }
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