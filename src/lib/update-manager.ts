// Máquina de estados do actualizador da aplicação (lógica pura, sem DOM).
//
// Política:
//  - Nunca recarrega sozinha por nova versão (SW ou version.json): fica um
//    único estado «versão nova disponível» até o utilizador clicar «Atualizar».
//  - «Atualizar» só está disponível sem trabalho pendente; é revalidado antes
//    de navegar.
//  - Os canais convergem num estado por build; aplicar corre uma vez.
//  - Falha de chunk: no máximo uma tentativa automática por sessão, e só sem
//    trabalho pendente; caso contrário, o mesmo aviso.

export type UpdateSource = "sw" | "version" | "chunk";
export type UpdateReason = "new-version" | "chunk-error";

export interface UpdateView {
  available: boolean;
  buildId: string | null;
  reason: UpdateReason | null;
  /** Razões que impedem actualizar agora (vazio = pode). */
  blockers: string[];
  canApply: boolean;
  applying: boolean;
}

export interface UpdaterDeps {
  /** Razões legíveis de trabalho pendente (mutações, dialogs, formulários, recuperação de senha). */
  getBlockers(): string[];
  /** Avisa quando o trabalho pendente muda. */
  subscribeWork?(listener: () => void): () => void;
  /** Activa o SW em espera e limpa caches. Chamado no máximo uma vez. */
  prepare(): Promise<void>;
  /** Navegação única para a versão nova. */
  navigate(buildId: string | null): void;
  /** Tentativa automática de recuperação de chunk. */
  autoReload(): void;
  /** true só na primeira tentativa automática da sessão. */
  claimAutoRetry(): boolean;
}

export type ApplyResult = "navigated" | "blocked" | "noop";
export type ChunkErrorResult = "auto-reload" | "notice";

const IDLE: UpdateView = {
  available: false,
  buildId: null,
  reason: null,
  blockers: [],
  canApply: false,
  applying: false,
};

export function createUpdater(deps: UpdaterDeps) {
  let available = false;
  let buildId: string | null = null;
  let reason: UpdateReason | null = null;
  let applying = false;
  let prepared = false;
  const appliedBuilds = new Set<string>();
  const listeners = new Set<() => void>();
  let view: UpdateView = IDLE;

  function compute(): UpdateView {
    if (!available) return IDLE;
    const blockers = deps.getBlockers();
    return {
      available,
      buildId,
      reason,
      blockers,
      canApply: blockers.length === 0 && !applying,
      applying,
    };
  }

  function sameView(a: UpdateView, b: UpdateView) {
    return (
      a.available === b.available &&
      a.buildId === b.buildId &&
      a.reason === b.reason &&
      a.canApply === b.canApply &&
      a.applying === b.applying &&
      a.blockers.length === b.blockers.length &&
      a.blockers.every((item, i) => item === b.blockers[i])
    );
  }

  /** Recalcula a vista; só notifica se mudou (referência estável para React). */
  function refresh() {
    const next = compute();
    if (sameView(view, next)) return;
    view = next;
    listeners.forEach((listener) => listener());
  }

  deps.subscribeWork?.(refresh);

  function signal(source: UpdateSource, signalBuildId?: string | null) {
    if (signalBuildId && appliedBuilds.has(signalBuildId)) return;
    available = true;
    if (signalBuildId) buildId = signalBuildId;
    if (source === "chunk") {
      reason = reason ?? "chunk-error";
    } else {
      reason = "new-version";
    }
    refresh();
  }

  function reportChunkError(): ChunkErrorResult {
    if (!available && deps.getBlockers().length === 0 && deps.claimAutoRetry()) {
      deps.autoReload();
      return "auto-reload";
    }
    signal("chunk");
    return "notice";
  }

  async function apply(): Promise<ApplyResult> {
    if (!available || applying) return "noop";
    if (deps.getBlockers().length > 0) {
      refresh();
      return "blocked";
    }

    applying = true;
    refresh();

    if (!prepared) {
      prepared = true;
      try {
        await deps.prepare();
      } catch {
        // falha de limpeza de caches não impede a navegação.
      }
    }

    // Revalidar imediatamente antes de navegar: o utilizador pode ter
    // aberto um dialog ou começado a editar durante o await.
    if (deps.getBlockers().length > 0) {
      applying = false;
      refresh();
      return "blocked";
    }

    if (buildId) appliedBuilds.add(buildId);
    deps.navigate(buildId);
    return "navigated";
  }

  return {
    signal,
    reportChunkError,
    apply,
    refresh,
    getView: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type Updater = ReturnType<typeof createUpdater>;
