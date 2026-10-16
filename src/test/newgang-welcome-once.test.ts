import { describe, it, expect, vi } from "vitest";
import { sendWelcomeOnce, PreSendError, type WelcomeDeps } from "../../supabase/functions/newgang-portal/welcome";

// Simula a tabela club_welcome_reservations (PK member_id + escopo site/empresa) e um provedor mocked.
function store(opts: { legacySent?: string[]; site?: string } = {}) {
  const rows = new Map<string, { status: string; site: string }>();
  for (const id of opts.legacySent ?? []) rows.set(id, { status: "legacy_sent", site: "S1" });
  const members: Record<string, string> = { m1: "S1", m2: "S1", other: "S2" };
  const provider = vi.fn(async () => { await new Promise((r) => setTimeout(r, 5)); });
  const site = opts.site ?? "S1";
  const deps = (send = provider): WelcomeDeps => ({
    reserve: async (id) => {
      await Promise.resolve();
      if (members[id] !== site) return false; // isolamento site/empresa
      if (rows.has(id)) return false;         // ON CONFLICT DO NOTHING (síncrono = atómico)
      rows.set(id, { status: "reserved", site });
      return true;
    },
    mark: async (id, st) => { const r = rows.get(id)!; if (["reserved", "unknown"].includes(r.status)) r.status = st; },
    send: send as WelcomeDeps["send"],
  });
  return { rows, provider, deps };
}

describe("#321 welcome do Clube: uma única confirmação por membro", () => {
  it("chamadas simultâneas da mesma identidade -> 1 reserva, 1 chamada ao provedor", async () => {
    const s = store();
    const res = await Promise.all(Array.from({ length: 8 }, () => sendWelcomeOnce(s.deps(), "m1")));
    expect(res.filter((r) => r === "sent")).toHaveLength(1);
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect(s.rows.get("m1")!.status).toBe("enqueued");
  });
  it("timeout/resposta desconhecida -> unknown, nova tentativa não chama o provedor", async () => {
    const s = store();
    const boom = vi.fn(async () => { throw new Error("timeout"); });
    expect(await sendWelcomeOnce(s.deps(boom), "m1")).toBe("unknown");
    expect(await sendWelcomeOnce(s.deps(), "m1")).toBe("skipped");
    expect(boom).toHaveBeenCalledTimes(1);
    expect(s.provider).not.toHaveBeenCalled();
    expect(s.rows.get("m1")!.status).toBe("unknown");
  });
  it("falha pré-envio é distinguida (error_pre_send) e não repete automaticamente", async () => {
    const s = store();
    const pre = vi.fn(async () => { throw new PreSendError("session"); });
    expect(await sendWelcomeOnce(s.deps(pre), "m1")).toBe("error_pre_send");
    expect(s.rows.get("m1")!.status).toBe("error_pre_send");
    expect(await sendWelcomeOnce(s.deps(), "m1")).toBe("skipped");
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("membro já enviado (legacy_sent) não recebe novo email", async () => {
    const s = store({ legacySent: ["m1"] });
    expect(await sendWelcomeOnce(s.deps(), "m1")).toBe("skipped");
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("isolamento: membro de outro site/empresa não é reservado", async () => {
    const s = store();
    expect(await sendWelcomeOnce(s.deps(), "other")).toBe("skipped");
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("erro ao reservar não envia; erro ao marcar não finge sent nem repete", async () => {
    const s = store();
    const d = s.deps();
    expect(await sendWelcomeOnce({ ...d, reserve: async () => { throw new Error("db"); } }, "m1")).toBe("skipped");
    expect(s.provider).not.toHaveBeenCalled();
    const log = vi.fn();
    expect(await sendWelcomeOnce({ ...d, mark: async () => { throw new Error("db"); }, log }, "m2")).toBe("sent");
    expect(log).toHaveBeenCalledWith("welcome_mark_failed", "m2", "db");
    expect(s.rows.get("m2")!.status).toBe("reserved"); // fica bloqueado, rastreável
    expect(await sendWelcomeOnce(d, "m2")).toBe("skipped");
    expect(s.provider).toHaveBeenCalledTimes(1);
  });
  it("membros distintos recebem cada um a sua confirmação", async () => {
    const s = store();
    await Promise.all([sendWelcomeOnce(s.deps(), "m1"), sendWelcomeOnce(s.deps(), "m2")]);
    expect(s.provider).toHaveBeenCalledTimes(2);
  });
});
