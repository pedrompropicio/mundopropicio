// Injetado por `define` no vite.config.ts (um valor por build).
declare const __BUILD_ID__: string;

const VERSION_CHECK_INTERVAL_MS = 5 * 60_000;

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
 * Navega para a versão nova com cache-busting (`?v=`), furando a cache do
 * documento (Safari serve o index.html da cache HTTP). Só é chamado pelo
 * actualizador (src/lib/updater.ts) depois do clique do utilizador.
 * NÃO desregista service workers — isso provocaria um ciclo de
 * registo/controllerchange.
 */
export function navigateToBuild(buildId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.set("v", buildId ?? String(Date.now()));
  window.location.replace(url.toString());
}

function notify(buildId: string) {
  pendingBuildId = buildId;
  listeners.forEach((listener) => listener(buildId));
}

async function checkVersion() {
  if (document.visibilityState === "hidden") {
    return;
  }

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { buildId?: string };
    const remoteBuildId = data?.buildId;

    if (!remoteBuildId || remoteBuildId === __BUILD_ID__ || remoteBuildId === pendingBuildId) {
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
