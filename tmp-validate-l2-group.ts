import { buildPartnerStatement } from "@/lib/export-partner-statement";

const categories = [
  { id: "l1-2", name: "Custos do Evento", code: "2", parent_id: null },
  { id: "l2-21", name: "Artístico", code: "2.1", parent_id: "l1-2" },
  { id: "l3-211", name: "Cachês", code: "2.1.01", parent_id: "l2-21" },
  { id: "l3-212", name: "Comissões", code: "2.1.02", parent_id: "l2-21" },
  { id: "l2-22", name: "Custos Artísticos", code: "2.2", parent_id: "l1-2" },
  { id: "l3-221", name: "Aéreo", code: "2.2.01", parent_id: "l2-22" },
];

const st = buildPartnerStatement({
  eventName: "Teste L2",
  eventDate: "2026-09-05",
  forecasts: [
    { category_id: "l3-211", amount: 100, iva_rate: 23 },
    { category_id: "l3-212", amount: 200, iva_rate: 23 },
    { category_id: "l3-221", amount: 300, iva_rate: 23 },
  ],
  categories,
  revenues: [],
  documentsByCategoryId: {},
  shares: [{ name: "Sócio A", percentage: 70 }],
});

console.log("Famílias:", st.families.map((f) => ({ code: f.code, name: f.name, total: f.total, rubricas: f.rubricas.map((r) => r.code) })));
console.log("Total despesa:", st.expenseTotal);
console.log("Resultado:", st.result);
console.log("Sócios:", st.shares);

if (st.families.length !== 2) throw new Error(`Esperado 2 famílias, obtido ${st.families.length}`);
if (st.families[0].code !== "2.1") throw new Error(`Esperado família 2.1, obtido ${st.families[0].code}`);
if (st.families[1].code !== "2.2") throw new Error(`Esperado família 2.2, obtido ${st.families[1].code}`);
if (st.families[0].rubricas.length !== 2) throw new Error(`Esperado 2 rubricas em 2.1, obtido ${st.families[0].rubricas.length}`);
if (Math.abs(st.expenseTotal - (100 + 200 + 300) * 1.23) > 0.001) throw new Error("Total de despesa incorreto");

console.log("\nOK — agrupamento por L2 validado.");
