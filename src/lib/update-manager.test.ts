import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDirty,
  getPendingWorkLabels,
  hasPendingWork,
  markDirty,
  resetPendingWork,
  subscribePendingWork,
} from "./pending-work";
import { createUpdater } from "./update-manager";

function setup(opts: { autoRetryAvailable?: boolean } = {}) {
  let autoRetry = opts.autoRetryAvailable ?? true;
  const navigate = vi.fn();
  const autoReload = vi.fn();
  const prepare = vi.fn(async () => {});
  const updater = createUpdater({
    getBlockers: getPendingWorkLabels,
    subscribeWork: subscribePendingWork,
    prepare,
    navigate,
    autoReload,
    claimAutoRetry: () => {
      const ok = autoRetry;
      autoRetry = false;
      return ok;
    },
  });
  return { updater, navigate, autoReload, prepare };
}

beforeEach(() => resetPendingWork());

describe("pending-work", () => {
  it("markDirty/clearDirty por chave", () => {
    markDirty("form:a");
    markDirty("form:b", "rascunho por guardar");
    expect(hasPendingWork()).toBe(true);
    clearDirty("form:a");
    expect(hasPendingWork()).toBe(true);
    expect(getPendingWorkLabels()).toEqual(["rascunho por guardar"]);
    clearDirty("form:b");
    expect(hasPendingWork()).toBe(false);
  });

  it("é idempotente e só notifica em mudanças reais", () => {
    const listener = vi.fn();
    subscribePendingWork(listener);
    markDirty("k");
    markDirty("k");
    clearDirty("k");
    clearDirty("k");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("update-manager", () => {
  it("versão nova + trabalho pendente → sem reload e botão indisponível", async () => {
    const { updater, navigate, autoReload } = setup();
    markDirty("form:evento");
    updater.signal("version", "b2");

    const view = updater.getView();
    expect(view.available).toBe(true);
    expect(view.canApply).toBe(false);
    expect(view.blockers.length).toBeGreaterThan(0);
    expect(await updater.apply()).toBe("blocked");
    expect(navigate).not.toHaveBeenCalled();
    expect(autoReload).not.toHaveBeenCalled();
  });

  it("limpar o trabalho → botão disponível, sem reload", () => {
    const { updater, navigate, autoReload } = setup();
    markDirty("form:evento");
    updater.signal("sw");
    expect(updater.getView().canApply).toBe(false);

    clearDirty("form:evento");
    expect(updater.getView().canApply).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(autoReload).not.toHaveBeenCalled();
  });

  it("página ociosa com versão nova: aviso, nunca reload automático", () => {
    const { updater, navigate, autoReload } = setup();
    updater.signal("version", "b2");
    expect(updater.getView().available).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(autoReload).not.toHaveBeenCalled();
  });

  it("clique sem trabalho → uma única navegação (mesmo com cliques repetidos)", async () => {
    const { updater, navigate, prepare } = setup();
    updater.signal("version", "b2");

    const results = await Promise.all([updater.apply(), updater.apply()]);
    expect(results.sort()).toEqual(["navigated", "noop"]);
    expect(await updater.apply()).toBe("noop");
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("b2");
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("dois sinais do mesmo build (SW + version.json) → um só estado e uma navegação", async () => {
    const { updater, navigate, prepare } = setup();
    updater.signal("sw");
    updater.signal("version", "b2");
    updater.signal("version", "b2");
    updater.signal("sw");

    const view = updater.getView();
    expect(view).toMatchObject({ available: true, buildId: "b2", reason: "new-version" });

    await updater.apply();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);

    // sinal tardio do mesmo build já aplicado: ignorado.
    updater.signal("version", "b2");
    expect(await updater.apply()).toBe("noop");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("revalida antes de navegar: trabalho iniciado durante o prepare bloqueia", async () => {
    const { updater, navigate } = setup();
    const slow = createUpdater({
      getBlockers: getPendingWorkLabels,
      prepare: async () => {
        markDirty("dialog");
      },
      navigate,
      autoReload: vi.fn(),
      claimAutoRetry: () => false,
    });
    slow.signal("version", "b3");
    expect(await slow.apply()).toBe("blocked");
    expect(navigate).not.toHaveBeenCalled();
    expect(slow.getView().applying).toBe(false);

    clearDirty("dialog");
    expect(await slow.apply()).toBe("navigated");
    expect(navigate).toHaveBeenCalledTimes(1);
    void updater;
  });

  it("notifica só quando a vista muda", () => {
    const { updater } = setup();
    const listener = vi.fn();
    updater.subscribe(listener);
    updater.signal("version", "b2");
    updater.signal("version", "b2");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe("vite:preloadError", () => {
    it("com trabalho pendente → aviso sem reload, e não gasta a tentativa", () => {
      const { updater, autoReload } = setup();
      markDirty("form:evento");

      expect(updater.reportChunkError()).toBe("notice");
      expect(autoReload).not.toHaveBeenCalled();
      expect(updater.getView()).toMatchObject({ available: true, reason: "chunk-error", canApply: false });
    });

    it("sem trabalho → uma tentativa automática por sessão; a seguinte vira aviso", () => {
      const { updater, autoReload } = setup();

      expect(updater.reportChunkError()).toBe("auto-reload");
      expect(autoReload).toHaveBeenCalledTimes(1);

      expect(updater.reportChunkError()).toBe("notice");
      expect(autoReload).toHaveBeenCalledTimes(1);
      expect(updater.getView()).toMatchObject({ available: true, reason: "chunk-error", canApply: true });
    });

    it("com versão nova já assinalada → aviso, sem reload automático", () => {
      const { updater, autoReload } = setup();
      updater.signal("version", "b2");
      expect(updater.reportChunkError()).toBe("notice");
      expect(autoReload).not.toHaveBeenCalled();
      expect(updater.getView().reason).toBe("new-version");
    });
  });
});
