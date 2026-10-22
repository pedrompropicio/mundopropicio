import { describe, it, expect } from "vitest";
import {
  buildOffsetPlan,
  offsetErrorMessage,
  eurosToCents,
  centsToEuros,
  parseEuroAmount,
  formatEurCents,
  OFFSET_ERROR_CODES,
  OFFSET_ERROR_MESSAGES,
  OFFSET_PLAN_MAX_ITEMS,
  type OffsetDocumentInput,
} from "../transaction-offset-plan";

// Valores em cêntimos (ex.: e(12300) = 12.300,00 €)
const e = eurosToCents;

const tx = (
  id: string,
  sign: "income" | "expense",
  openCents: number,
  extra: Partial<OffsetDocumentInput> = {},
): OffsetDocumentInput => ({ id, kind: "transaction", sign, open_cents: openCents, ...extra });

describe("buildOffsetPlan — exemplo da Issue", () => {
  // 12.300 + 15.900 − 5.650 − 3.690 = 18.860
  const docs = [
    tx("r1", "income", e(12300)),
    tx("r2", "income", e(15900)),
    tx("d1", "expense", e(5650)),
    tx("d2", "expense", e(3690)),
  ];
  const plan = buildOffsetPlan({ amount_cents: e(18860), direction: "in" }, docs);

  it("fecha sem erros", () => {
    expect(plan.ok).toBe(true);
    expect(plan.errors).toEqual([]);
    expect(plan.totals?.difference_cents).toBe(0);
  });

  it("reparte dinheiro e compensação com valores exactos", () => {
    const byId = Object.fromEntries(plan.items.map((it) => [it.document_id, it]));
    expect(byId.r1.cash_cents).toBe(e(12300));
    expect(byId.r1.offset_cents).toBe(0);
    expect(byId.r2.cash_cents).toBe(e(6560)); // 15.900 − 9.340
    expect(byId.r2.offset_cents).toBe(e(9340));
    expect(byId.d1.cash_cents).toBe(0);
    expect(byId.d1.offset_cents).toBe(e(5650));
    expect(byId.d2.cash_cents).toBe(0);
    expect(byId.d2.offset_cents).toBe(e(3690));
  });

  it("totais: dinheiro = movimento; compensação igual dos dois lados", () => {
    expect(plan.totals?.cash_cents).toBe(e(18860));
    expect(plan.totals?.offset_settle_cents).toBe(e(9340));
    expect(plan.totals?.offset_opposite_cents).toBe(e(9340));
  });

  it("itens do contrato: um de transaction_id/forecast_id, sem amount/paid_amount/iva_rate", () => {
    expect(plan.contract_items).toHaveLength(4);
    for (const ci of plan.contract_items) {
      const keys = Object.keys(ci);
      expect("transaction_id" in ci || "forecast_id" in ci).toBe(true);
      expect("transaction_id" in ci && "forecast_id" in ci).toBe(false);
      expect(keys).not.toContain("amount");
      expect(keys).not.toContain("paid_amount");
      expect(keys).not.toContain("iva_rate");
      expect(ci.expected_open_cents).toBeGreaterThan(0);
    }
    const r2 = plan.contract_items.find((ci) => ci.transaction_id === "r2");
    expect(r2?.mode).toBe("settle");
    expect(r2?.cash_order).toBe(2);
    const d1 = plan.contract_items.find((ci) => ci.transaction_id === "d1");
    expect(d1?.mode).toBe("offset");
    expect(d1?.cash_order).toBeNull();
  });
});

describe("buildOffsetPlan — caso Estoril", () => {
  // linha 23.406; receita 30.996 (23.406 dinheiro + 7.590 compensação); despesa 7.590 (compensação)
  const plan = buildOffsetPlan({ amount_cents: e(23406), direction: "in" }, [
    tx("rec", "income", e(30996)),
    tx("des", "expense", e(7590)),
  ]);

  it("receita: 23.406 dinheiro + 7.590 compensação; despesa: 7.590 compensação", () => {
    expect(plan.ok).toBe(true);
    const byId = Object.fromEntries(plan.items.map((it) => [it.document_id, it]));
    expect(byId.rec.cash_cents).toBe(e(23406));
    expect(byId.rec.offset_cents).toBe(e(7590));
    expect(byId.des.cash_cents).toBe(0);
    expect(byId.des.offset_cents).toBe(e(7590));
    expect(plan.totals?.offset_settle_cents).toBe(plan.totals?.offset_opposite_cents);
  });
});

describe("buildOffsetPlan — ordem do dinheiro", () => {
  const docs = [
    tx("r1", "income", e(12300)),
    tx("r2", "income", e(15900)),
    tx("d1", "expense", e(5650)),
    tx("d2", "expense", e(3690)),
  ];

  it("ordem invertida: r2 recebe o dinheiro primeiro", () => {
    const plan = buildOffsetPlan({ amount_cents: e(18860), direction: "in" }, docs, ["r2", "r1"]);
    expect(plan.ok).toBe(true);
    const byId = Object.fromEntries(plan.items.map((it) => [it.document_id, it]));
    expect(byId.r2.cash_cents).toBe(e(15900));
    expect(byId.r2.offset_cents).toBe(0);
    expect(byId.r1.cash_cents).toBe(e(2960)); // 18.860 − 15.900
    expect(byId.r1.offset_cents).toBe(e(9340));
    expect(byId.r2.cash_order).toBe(1);
    expect(byId.r1.cash_order).toBe(2);
    expect(plan.totals?.cash_cents).toBe(e(18860));
  });

  it("débito simétrico (movimento de saída): despesas liquidam, receitas compensam", () => {
    const mirror = [
      tx("d1", "expense", e(12300)),
      tx("d2", "expense", e(15900)),
      tx("r1", "income", e(5650)),
      tx("r2", "income", e(3690)),
    ];
    const plan = buildOffsetPlan({ amount_cents: e(18860), direction: "out" }, mirror);
    expect(plan.ok).toBe(true);
    const byId = Object.fromEntries(plan.items.map((it) => [it.document_id, it]));
    expect(byId.d1.mode).toBe("settle");
    expect(byId.d1.cash_cents).toBe(e(12300));
    expect(byId.d2.cash_cents).toBe(e(6560));
    expect(byId.d2.offset_cents).toBe(e(9340));
    expect(byId.r1.mode).toBe("offset");
    expect(byId.r1.cash_cents).toBe(0);
    expect(byId.r1.offset_cents).toBe(e(5650));
    expect(byId.r2.offset_cents).toBe(e(3690));
  });
});

describe("buildOffsetPlan — movimento e saldos zero", () => {
  it("movimento zero é recusado", () => {
    const plan = buildOffsetPlan({ amount_cents: 0, direction: "in" }, [
      tx("r", "income", e(100)),
      tx("d", "expense", e(100)),
    ]);
    expect(plan.ok).toBe(false);
    expect(plan.errors[0].code).toBe("invalid_movement");
  });

  it("documento sem dívida em aberto é recusado (no_open_debt)", () => {
    const plan = buildOffsetPlan({ amount_cents: e(100), direction: "in" }, [
      tx("r", "income", 0),
      tx("d", "expense", e(100)),
    ]);
    expect(plan.ok).toBe(false);
    expect(plan.errors.map((er) => er.code)).toContain("no_open_debt");
  });
});

describe("buildOffsetPlan — igualdade exacta (sem tolerância)", () => {
  const base = [
    tx("r1", "income", e(12300)),
    tx("r2", "income", e(15900)),
    tx("d1", "expense", e(5650)),
    tx("d2", "expense", e(3690)),
  ];

  it("diferença de 0,01 € a menos é recusada: 'Faltam 0,01 €'", () => {
    const docs = base.map((d) => (d.id === "r2" ? { ...d, open_cents: d.open_cents - 1 } : d));
    const plan = buildOffsetPlan({ amount_cents: e(18860), direction: "in" }, docs);
    expect(plan.ok).toBe(false);
    expect(plan.errors[0].code).toBe("amount_mismatch");
    expect(plan.errors[0].message).toBe("Faltam 0,01 €");
  });

  it("diferença de 0,01 € a mais é recusada: 'Excedem 0,01 €; corrija a transação ou o BP'", () => {
    const docs = base.map((d) => (d.id === "r2" ? { ...d, open_cents: d.open_cents + 1 } : d));
    const plan = buildOffsetPlan({ amount_cents: e(18860), direction: "in" }, docs);
    expect(plan.ok).toBe(false);
    expect(plan.errors[0].code).toBe("amount_mismatch");
    expect(plan.errors[0].message).toBe("Excedem 0,01 €; corrija a transação ou o BP");
  });

  it("formatação pt-PT com milhares: 'Faltam 1.234,56 €'", () => {
    const docs = [
      tx("r", "income", e(10000)),
      tx("d", "expense", e(100)),
    ];
    // mesmo sinal − oposto = 9.900; movimento = 9.900 + 1.234,56
    const plan = buildOffsetPlan({ amount_cents: e(9900) + 123456, direction: "in" }, docs);
    expect(plan.ok).toBe(false);
    expect(plan.errors[0].message).toBe("Faltam 1.234,56 €");
  });
});

describe("buildOffsetPlan — dívida parcial", () => {
  it("receita de 100 € com movimento de 60 €: 60 dinheiro + 40 compensação", () => {
    const plan = buildOffsetPlan({ amount_cents: e(60), direction: "in" }, [
      tx("r", "income", e(100)),
      tx("d", "expense", e(40)),
    ]);
    expect(plan.ok).toBe(true);
    const byId = Object.fromEntries(plan.items.map((it) => [it.document_id, it]));
    expect(byId.r.cash_cents).toBe(e(60));
    expect(byId.r.offset_cents).toBe(e(40));
    expect(byId.d.offset_cents).toBe(e(40));
  });
});

describe("buildOffsetPlan — limites", () => {
  const many = (n: number): OffsetDocumentInput[] => {
    const docs: OffsetDocumentInput[] = [];
    for (let i = 0; i < n / 2; i++) docs.push(tx(`r${i}`, "income", e(2)));
    for (let i = 0; i < n / 2; i++) docs.push(tx(`d${i}`, "expense", e(1)));
    return docs;
  };

  it("50 itens são aceites", () => {
    const plan = buildOffsetPlan({ amount_cents: e(25), direction: "in" }, many(50));
    expect(plan.ok).toBe(true);
    expect(plan.contract_items).toHaveLength(50);
  });

  it("51 itens são recusados (too_many_items)", () => {
    const docs = [...many(50), tx("extra", "income", e(2))];
    const plan = buildOffsetPlan({ amount_cents: e(25), direction: "in" }, docs);
    expect(plan.ok).toBe(false);
    expect(plan.errors[0].code).toBe("too_many_items");
    expect(plan.errors[0].message).toBe("Máximo de 50 documentos por encontro.");
    expect(OFFSET_PLAN_MAX_ITEMS).toBe(50);
  });

  it("menos de 2 itens é recusado", () => {
    const plan = buildOffsetPlan({ amount_cents: e(100), direction: "in" }, [tx("r", "income", e(100))]);
    expect(plan.ok).toBe(false);
    expect(plan.errors[0].code).toBe("too_few_items");
  });

  it("um só sinal é recusado (both_signs_required)", () => {
    const plan = buildOffsetPlan({ amount_cents: e(100), direction: "in" }, [
      tx("r1", "income", e(60)),
      tx("r2", "income", e(40)),
    ]);
    expect(plan.ok).toBe(false);
    expect(plan.errors[0].code).toBe("both_signs_required");
    expect(plan.errors[0].message).toBe("Escolha pelo menos uma receita e uma despesa.");
  });
});

describe("buildOffsetPlan — elegibilidade espelhada", () => {
  const ok = (extra: Partial<OffsetDocumentInput>, id = "r") =>
    buildOffsetPlan({ amount_cents: e(60), direction: "in" }, [
      tx(id, "income", e(100), extra),
      tx("d", "expense", e(40)),
    ]);

  it("parcelas recusadas (unsupported_debt)", () => {
    const plan = ok({ has_installments: true });
    expect(plan.ok).toBe(false);
    expect(plan.errors.map((er) => er.code)).toContain("unsupported_debt");
  });

  it("crédito, retenção e FX recusados (unsupported_debt)", () => {
    for (const flag of ["has_credit", "has_withholding", "has_fx"] as const) {
      expect(ok({ [flag]: true }).errors.map((er) => er.code)).toContain("unsupported_debt");
    }
  });

  it("moeda não-EUR recusada (unsupported_debt)", () => {
    expect(ok({ currency: "BRL" }).errors.map((er) => er.code)).toContain("unsupported_debt");
  });

  it("perna de camarim recusada (camarim_leg_unsupported)", () => {
    expect(ok({ leg_type: "camarim" }).errors.map((er) => er.code)).toContain("camarim_leg_unsupported");
  });

  it("reembolso/cartão/aporte/custo partilhado/transitória recusados", () => {
    for (const leg of ["reimbursement", "card", "aporte", "shared_cost", "transitory"] as const) {
      expect(ok({ leg_type: leg }).errors.map((er) => er.code)).toContain("unsupported_debt");
    }
  });

  it("evento fechado e acerto selado recusados", () => {
    expect(ok({ event_closed: true }).errors.map((er) => er.code)).toContain("event_closed");
    expect(ok({ settlement_sealed: true }).errors.map((er) => er.code)).toContain("sealed_settlement");
  });

  it("precisão superior a 2 casas recusada (document_precision_unsupported)", () => {
    expect(ok({ open_amount_raw: "100,005" }).errors.map((er) => er.code)).toContain(
      "document_precision_unsupported",
    );
  });

  it("dívida mudada desde a prévia (preview_changed)", () => {
    expect(ok({ expected_open_cents: e(90) }).errors.map((er) => er.code)).toContain("preview_changed");
  });

  it("documento indisponível e previsão partilhada/vínculo negado", () => {
    expect(ok({ available: false }).errors.map((er) => er.code)).toContain("document_not_available");
    const forecast = (extra: Partial<OffsetDocumentInput>) =>
      buildOffsetPlan({ amount_cents: e(60), direction: "in" }, [
        tx("f", "income", e(100), { kind: "forecast", ...extra }),
        tx("d", "expense", e(40)),
      ]);
    expect(forecast({ available: false }).errors.map((er) => er.code)).toContain("forecast_not_available");
    expect(forecast({ shared_forecast: true }).errors.map((er) => er.code)).toContain(
      "forecast_shared_no_creation",
    );
    expect(forecast({ link_denied: true }).errors.map((er) => er.code)).toContain("forecast_link_denied");
    // contrato: forecast usa forecast_id
    expect(forecast({}).contract_items[0].forecast_id).toBe("f");
  });
});

describe("conversões euros <-> cêntimos (sem floats)", () => {
  it("0,1 + 0,2 = 0,3 exactamente em cêntimos", () => {
    expect(eurosToCents(0.1) + eurosToCents(0.2)).toBe(eurosToCents(0.3));
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    expect(centsToEuros(30)).toBe(0.3);
  });

  it("plano com cêntimos que falhariam em float (0,10/0,20/0,30)", () => {
    const plan = buildOffsetPlan({ amount_cents: eurosToCents(0.2), direction: "in" }, [
      tx("r1", "income", eurosToCents(0.1)),
      tx("r2", "income", eurosToCents(0.2)),
      tx("d1", "expense", eurosToCents(0.1)),
    ]);
    expect(plan.ok).toBe(true);
    expect(plan.totals?.difference_cents).toBe(0);
    expect(plan.totals?.offset_settle_cents).toBe(plan.totals?.offset_opposite_cents);
  });

  it("parseEuroAmount: pt-PT e precisão", () => {
    expect(parseEuroAmount("1.234,56")).toBe(123456);
    expect(parseEuroAmount("0,01")).toBe(1);
    expect(parseEuroAmount("1234.56")).toBe(123456);
    expect(parseEuroAmount("10,005")).toBeNull();
    expect(parseEuroAmount("abc")).toBeNull();
  });

  it("formatEurCents: vírgula decimal e ponto de milhar", () => {
    expect(formatEurCents(123456)).toBe("1.234,56 €");
    expect(formatEurCents(1)).toBe("0,01 €");
    expect(formatEurCents(100000000)).toBe("1.000.000,00 €");
  });
});

describe("mapa de códigos de erro -> pt-PT", () => {
  it("todos os códigos listados têm mensagem", () => {
    for (const code of OFFSET_ERROR_CODES) {
      expect(OFFSET_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      expect(offsetErrorMessage(code)).toBe(OFFSET_ERROR_MESSAGES[code]);
    }
  });

  it("textos de referência exactos", () => {
    expect(offsetErrorMessage("encontro_desativado")).toBe(
      "Encontros de contas estão temporariamente desativados.",
    );
    expect(offsetErrorMessage("encontro_em_conflito")).toBe(
      "Outro utilizador está a alterar estes documentos. Recarregue a prévia e tente de novo.",
    );
    expect(offsetErrorMessage("preview_changed")).toBe(
      "A dívida de um documento mudou desde a prévia. Recarregue.",
    );
    expect(offsetErrorMessage("permission_denied")).toBe("Não tem permissão para esta operação.");
    expect(offsetErrorMessage("both_signs_required")).toBe("Escolha pelo menos uma receita e uma despesa.");
    expect(offsetErrorMessage("too_many_items")).toBe("Máximo de 50 documentos por encontro.");
    expect(offsetErrorMessage("unsupported_debt")).toBe(
      "Este documento ainda não é suportado no encontro de contas.",
    );
    expect(offsetErrorMessage("camarim_leg_unsupported")).toBe(
      "Este documento ainda não é suportado no encontro de contas.",
    );
    expect(offsetErrorMessage("document_precision_unsupported")).toBe(
      "Este documento ainda não é suportado no encontro de contas.",
    );
    expect(offsetErrorMessage("cash_account_inconsistent")).toBe(
      "A conta das pernas deste documento é inconsistente; corrija antes.",
    );
    expect(offsetErrorMessage("reverse_entire_group")).toBe(
      "Esta perna faz parte de um encontro; estorne o encontro inteiro.",
    );
    expect(offsetErrorMessage("managed_operation_required")).toBe(
      "Esta perna faz parte de um encontro; estorne o encontro inteiro.",
    );
    expect(offsetErrorMessage("request_changed")).toBe("Erro interno no pedido. Recomece a operação.");
    expect(offsetErrorMessage("request_actor_mismatch")).toBe(
      "Erro interno no pedido. Recomece a operação.",
    );
  });

  it("código desconhecido devolve mensagem genérica com o código", () => {
    const msg = offsetErrorMessage("codigo_que_nao_existe");
    expect(msg).toContain("codigo_que_nao_existe");
  });
});
