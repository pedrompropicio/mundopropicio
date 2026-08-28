// Injetado por `define` no vite.config.ts (um valor por build).
declare const __BUILD_ID__: string;

const VERSION_CHECK_INTERVAL_MS = 5 * 60_000;
// Chave baseada no build EM EXECUÇÃO: cada versão só pode provocar um
// recarregamento por sessão, venha ele do service worker ou do version.json.
const RELOAD_GUARD_KEY = `mp_reloaded_from_${__BUILD_ID__}`;

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
 * Marca (uma única vez por sessão e por build em execução) que já provocámos um
 * recarregamento. Devolve false se já tinha sido marcado — nesse caso NÃO se
 * deve recarregar, para tornar impossível um ciclo.
 */
export function claimReloadGuard() {
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  } catch {
    // sessionStorage indisponível — segue em frente.
  }
  return true;
}

/**
 * Recarregamento com cache-busting agressivo (usado pelo poller do
 * version.json). Fura a cache do documento (Safari serve o index.html da
 * própria cache HTTP) apagando caches e navegando com um parâmetro `?v=`.
 * NÃO desregista service workers — isso provocaria um ciclo de
 * registo/controllerchange.
 */
export async function applyUpdate(buildId?: string) {
  if (!claimReloadGuard()) {
    return;
  }

  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignora
  }

  const url = new URL(window.location.href);
  url.searchParams.set("v", buildId ?? String(Date.now()));
  window.location.replace(url.toString());
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
