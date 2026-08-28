// Injetado por `define` no vite.config.ts (um valor por build).
declare const __BUILD_ID__: string;

const VERSION_CHECK_INTERVAL_MS = 5 * 60_000;
const RELOADED_BUILD_KEY = "mp_reloaded_build_id";

type NewVersionListener = (buildId: string) => void;

const listeners = new Set<NewVersionListener>();
let pendingBuildId: string | null = null;
let started = false;

export function subscribeToNewVersion(listener: NewVersionListener) {
  listeners.add(listener);

  if (pendingBuildId) {
    listener(pendingBuildId);
  }

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Único caminho de recarregamento da app. Fura a cache do documento (Safari
 * serve o index.html da própria cache HTTP) apagando caches, desregistando
 * service workers e navegando com um parâmetro de cache-busting.
 */
export async function applyUpdate(buildId?: string) {
  try {
    if (buildId) {
      sessionStorage.setItem(RELOADED_BUILD_KEY, buildId);
    }
  } catch {
    // sessionStorage indisponível — segue em frente.
  }

  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignora
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // ignora
  }

  const url = new URL(window.location.href);
  url.searchParams.set("v", buildId ?? String(Date.now()));
  window.location.replace(url.toString());
}

function alreadyReloadedFor(buildId: string) {
  try {
    return sessionStorage.getItem(RELOADED_BUILD_KEY) === buildId;
  } catch {
    return false;
  }
}

function notify(buildId: string) {
  pendingBuildId = buildId;
  listeners.forEach((listener) => listener(buildId));
}

async function checkVersion() {
  if (document.visibilityState === "hidden" || pendingBuildId) {
    return;
  }

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { buildId?: string };
    const remoteBuildId = data?.buildId;

    if (!remoteBuildId || remoteBuildId === __BUILD_ID__ || alreadyReloadedFor(remoteBuildId)) {
      return;
    }

    notify(remoteBuildId);
  } catch {
    // offline / erro de rede: silêncio.
  }
}

export function startVersionCheck() {
  if (import.meta.env.DEV || started) {
    return;
  }
  started = true;

  void checkVersion();
  window.setInterval(() => void checkVersion(), VERSION_CHECK_INTERVAL_MS);
  window.addEventListener("focus", () => void checkVersion());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkVersion();
    }
  });
}
