// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { carregarPercentagens, type TicketForecastClient } from "../../supabase/functions/_shared/ticketing/planning-forecast-loader";
import { parseTicketForecastInputs, resolverPct, type TicketForecastEventInput, type TicketForecastInputs } from "../../supabase/functions/_shared/ticketing/planning-forecast-contract";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const COMPANY = uuid(1), EVENT = uuid(2), VERSION = uuid(3);
const event = (event_id = EVENT): TicketForecastEventInput => ({ event_id, percentagem: 60, origem: "evento",
  receita_manual_iva_rate: null, sessions: [{ session_id: uuid(10000), session_date: "2026-11-07", session_start_time: null,
    session_sort_order: 0, percentagem: 25, origem: "sessao" }] });
const response = (ids = [EVENT]): TicketForecastInputs => ({ version: "ticket-forecast-inputs-v1", company_id: COMPANY,
  events: ids.map(id => ({ ...event(id), sessions: [] })) });
const client = () => ({ rpc: vi.fn<TicketForecastClient["rpc"]>(async (_name, args) => ({ data: response(args.p_event_ids), error: null })) });
const fetchTrap = vi.fn(() => { throw new Error("network_forbidden_in_synthetic_test"); });
beforeEach(() => { fetchTrap.mockClear(); vi.stubGlobal("fetch", fetchTrap); });
afterEach(() => { expect(fetchTrap).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("#646 D2-d B — critério 8: loader comum sem rede", () => {
  it.each([101, 150, 199, 200, 201, 250])("%s eventos em lotes únicos de até 100", async count => {
    const input = Array.from({ length: count }, (_, i) => uuid(100 + i));
    const fake = client();
    const output = await carregarPercentagens(fake, COMPANY, input);
    expect(output.events.map(row => row.event_id)).toEqual(input);
    expect(fake.rpc).toHaveBeenCalledTimes(Math.ceil(count / 100));
    expect(fake.rpc.mock.calls.flatMap(([, args]) => args.p_event_ids)).toEqual(input);
    expect(fake.rpc.mock.calls.every(([name, args]) => name === "get_event_ticket_forecast_inputs"
      && args.p_company_id === COMPANY && args.p_version_id === null && args.p_event_ids.length <= 100)).toBe(true);
  });
  it("deduplica os IDs pedidos antes de chamar e não duplica resultados", async () => {
    const fake = client();
    const result = await carregarPercentagens(fake, COMPANY, [EVENT, EVENT, uuid(4), EVENT]);
    expect(result.events.map(row => row.event_id)).toEqual([EVENT, uuid(4)]);
    expect(fake.rpc.mock.calls[0][1].p_event_ids).toEqual([EVENT, uuid(4)]);
  });
  it("pedido vazio explícito não chama RPC; versão com zero eventos é inválida", async () => {
    const fake = client();
    expect(await carregarPercentagens(fake, COMPANY, [])).toEqual({ version: "ticket-forecast-inputs-v1", company_id: COMPANY, events: [] });
    await expect(carregarPercentagens(fake, COMPANY, [], VERSION)).rejects.toThrow("ticket_forecast_invalid_version_events");
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("versionId com mais de um evento falha antes de qualquer chamada", async () => {
    const fake = client();
    await expect(carregarPercentagens(fake, COMPANY, [EVENT, uuid(4)], VERSION)).rejects.toThrow("ticket_forecast_invalid_version_events");
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("versão é encaminhada para exactamente um ID único", async () => {
    const fake = client();
    await carregarPercentagens(fake, COMPANY, [EVENT, EVENT], VERSION);
    expect(fake.rpc).toHaveBeenCalledExactlyOnceWith("get_event_ticket_forecast_inputs", {
      p_company_id: COMPANY, p_event_ids: [EVENT], p_version_id: VERSION,
    });
  });
  it.each([
    ["invalid", [EVENT], undefined], [COMPANY, ["invalid"], undefined], [COMPANY, [EVENT], "invalid"],
  ] as const)("IDs inválidos não saem do cliente (%s)", async (company, ids, version) => {
    const fake = client();
    await expect(carregarPercentagens(fake, company, ids, version)).rejects.toThrow("ticket_forecast_invalid_id");
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it.each(["missing", "extra", "duplicate"])("resposta %s é erro, nunca conjunto parcial", async mode => {
    const fake = client();
    const data = response([EVENT, uuid(4)]);
    if (mode === "missing") data.events.pop();
    if (mode === "extra") data.events.push({ ...event(uuid(5)), sessions: [] });
    if (mode === "duplicate") data.events[1] = { ...data.events[0] };
    fake.rpc.mockResolvedValue({ data, error: null });
    await expect(carregarPercentagens(fake, COMPANY, [EVENT, uuid(4)])).rejects.toThrow("ticket_forecast_event_set_mismatch");
  });
  it("erro RPC propaga a mesma causa mesmo se vier com dados aparentemente válidos", async () => {
    const fake = client(), error = { code: "42501", message: "company_forbidden" };
    fake.rpc.mockResolvedValue({ data: response(), error });
    await expect(carregarPercentagens(fake, COMPANY, [EVENT])).rejects.toBe(error);
  });
  it("rejeição de transporte propaga a mesma causa", async () => {
    const fake = client(), error = new Error("transport_failed");
    fake.rpc.mockRejectedValue(error);
    await expect(carregarPercentagens(fake, COMPANY, [EVENT])).rejects.toBe(error);
  });
  it.each(["rpc", "parser"])("falha %s no segundo lote aborta antes do terceiro sem devolver o primeiro", async failure => {
    const fake = client(), error = new Error("second_batch_failed");
    fake.rpc.mockImplementation(async (_name, args) => {
      if (args.p_event_ids[0] === uuid(200)) return failure === "rpc" ? { data: null, error } : { data: response([]), error: null };
      return { data: response(args.p_event_ids), error: null };
    });
    await expect(carregarPercentagens(fake, COMPANY, Array.from({ length: 250 }, (_, i) => uuid(100 + i)))).rejects.toThrow();
    expect(fake.rpc).toHaveBeenCalledTimes(2);
  });
  it("ordem da RPC não altera ordem dos eventos pedidos", async () => {
    const fake = client();
    fake.rpc.mockResolvedValue({ data: response([uuid(4), EVENT]), error: null });
    expect((await carregarPercentagens(fake, COMPANY, [EVENT, uuid(4)])).events.map(row => row.event_id)).toEqual([EVENT, uuid(4)]);
  });
});

describe("#646 D2-d B — critérios 7/8: parser estrito de ticket-forecast-inputs-v1", () => {
  it("aceita o contrato 0341, taxa manual explícita e sessão lógica sem hora", () => {
    const data = { ...response(), events: [{ ...event(), receita_manual_iva_rate: 0 }] };
    const result = parseTicketForecastInputs(data, COMPANY, [EVENT]);
    expect(result).toEqual(data);
    expect(resolverPct(result.events[0], { date: "2026-11-07", start_time: null, sort_order: 0 }))
      .toEqual({ valor: 25, origem: "sessao" });
  });
  it.each([0, 100])("aceita percentagem explícita %s sem a trocar pelo padrão", percentagem => {
    const data = { ...response(), events: [{ ...event(), percentagem }] };
    expect(parseTicketForecastInputs(data, COMPANY, [EVENT]).events[0].percentagem).toBe(percentagem);
  });
  it("aceita ausência comprovada com origem padrao e herança efectiva de sessão", () => {
    const data = { ...response(), events: [{ ...event(), percentagem: 100, origem: "padrao" as const,
      sessions: [{ ...event().sessions[0], percentagem: 100, origem: "padrao" as const }] }] };
    expect(parseTicketForecastInputs(data, COMPANY, [EVENT])).toEqual(data);
    const inherited = { ...event(), sessions: [{ ...event().sessions[0], percentagem: 60, origem: "evento" as const }] };
    expect(parseTicketForecastInputs({ ...response(), events: [inherited] }, COMPANY, [EVENT]).events[0]).toEqual(inherited);
  });
  type Mutation = (payload: any) => void;
  const invalid: [string, Mutation][] = [
    ["versão", data => { data.version = "ticket-forecast-v1"; }],
    ["empresa", data => { data.company_id = uuid(99); }],
    ["campo extra raiz", data => { data.extra = 1; }],
    ["sem events", data => { delete data.events; }],
    ["events nulo", data => { data.events = null; }],
    ["campo extra evento", data => { data.events[0].extra = true; }],
    ["sem percentagem", data => { delete data.events[0].percentagem; }],
    ["percentagem string", data => { data.events[0].percentagem = "60"; }],
    ["percentagem NaN", data => { data.events[0].percentagem = NaN; }],
    ["percentagem infinita", data => { data.events[0].percentagem = Infinity; }],
    ["percentagem negativa", data => { data.events[0].percentagem = -1; }],
    ["percentagem >100", data => { data.events[0].percentagem = 101; }],
    ["origem inválida", data => { data.events[0].origem = "root"; }],
    ["origem sessão no evento", data => { data.events[0].origem = "sessao"; }],
    ["padrão diferente de 100", data => { data.events[0].origem = "padrao"; }],
    ["sem IVA manual", data => { delete data.events[0].receita_manual_iva_rate; }],
    ["IVA string", data => { data.events[0].receita_manual_iva_rate = "0"; }],
    ["IVA negativo", data => { data.events[0].receita_manual_iva_rate = -1; }],
    ["IVA infinito", data => { data.events[0].receita_manual_iva_rate = Infinity; }],
    ["IVA >100", data => { data.events[0].receita_manual_iva_rate = 101; }],
    ["sessions nulo", data => { data.events[0].sessions = null; }],
    ["campo extra sessão", data => { data.events[0].sessions[0].extra = 1; }],
    ["sem UUID físico", data => { delete data.events[0].sessions[0].session_id; }],
    ["data impossível", data => { data.events[0].sessions[0].session_date = "2026-02-29"; }],
    ["data nula", data => { data.events[0].sessions[0].session_date = null; }],
    ["hora inválida", data => { data.events[0].sessions[0].session_start_time = "25:00:00"; }],
    ["hora ausente", data => { delete data.events[0].sessions[0].session_start_time; }],
    ["ordem fraccionária", data => { data.events[0].sessions[0].session_sort_order = 1.5; }],
    ["ordem nula", data => { data.events[0].sessions[0].session_sort_order = null; }],
    ["percentagem de sessão inválida", data => { data.events[0].sessions[0].percentagem = NaN; }],
    ["origem de sessão inválida", data => { data.events[0].sessions[0].origem = "bp"; }],
    ["herança de evento incoerente", data => { data.events[0].sessions[0].origem = "evento"; }],
    ["padrão de sessão incoerente", data => { data.events[0].sessions[0].origem = "padrao"; }],
  ];
  it.each(invalid)("recusa %s", (_name, mutate) => {
    const data = { ...response(), events: [event()] };
    mutate(data);
    expect(() => parseTicketForecastInputs(data, COMPANY, [EVENT])).toThrow();
  });
  it.each([null, [], 100, "json"])("raiz %j não se converte em lista vazia", data => {
    expect(() => parseTicketForecastInputs(data, COMPANY, [EVENT])).toThrow();
  });
  it.each(["key", "uuid"])("sessão repetida por %s é ambígua", mode => {
    const original = event();
    original.sessions.push({ ...original.sessions[0], ...(mode === "key" ? { session_id: uuid(10001) } : { session_sort_order: 1 }) });
    expect(() => parseTicketForecastInputs({ ...response(), events: [original] }, COMPANY, [EVENT])).toThrow("ticket_forecast_session_ambiguous");
  });
  it("pedido duplicado não é disfarçado pelo parser", () => {
    expect(() => parseTicketForecastInputs(response(), COMPANY, [EVENT, EVENT])).toThrow("ticket_forecast_duplicate_request");
  });
});
