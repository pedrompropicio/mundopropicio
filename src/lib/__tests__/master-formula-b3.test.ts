import { describe, expect, it } from "vitest";
import { computeMasterBpFormula, masterFormulaShares, masterFormulaCostInputsForCity } from "@/lib/master-formula";
import { computeBpFormula } from "@/lib/bp-formula";
import { expandOverheadToSplits, overheadLinesFor } from "@/lib/overhead-proration";
import { expandMasterAdoptedExpensesToSplits } from "@/lib/master-adopted-expense-proration";
import { applyRevenueFloor, canRecalculateFormulas } from "@/lib/bp-formula-line-rules";
import live from "./fixtures/master-revenue-live-2026-10-23.json";

const cities = [
  { eventId: "a", realized: true, sales: [{ zone_id: "za", quantity: 10, unit_price: 106, total_value: 1060, iva_rate: 6 }], courtesies: [], liveForecast: { gross: 9999, net: 9999, totalQty: 9999 } },
  { eventId: "b", realized: false, sales: [{ zone_id: "zb", quantity: 5, unit_price: 106, total_value: 530, iva_rate: 6 }], courtesies: [], liveForecast: { gross: 3180, net: 3000, totalQty: 30 } },
];
const events = [{ id: "m" }, { id: "a", parent_event_id: "m" }, { id: "b", parent_event_id: "m" }];
const pct = { rate: 2, basis: "gross" as const, zone_ids: null };
const formula = (amount = 100.01) => ({ id: "f", event_id: "m", amount, type: "expense", formula_type: "pct_ticket_revenue", formula_params: { ...pct, master_city_bases: { a: 1060, b: 3180 } } });

describe("#339 B3 — motor Master canónico", () => {
  it("% bruta: soma real da cidade realizada e previsto da futura", () => {
    const r = computeMasterBpFormula({ formulaType: "pct_ticket_revenue", params: pct, cities });
    expect(r.amount).toBe(84.8); expect(r.cityBases).toEqual({ a: 1060, b: 3180 });
    expect(r.amount).toBe(cities.reduce((s,c) => s+computeBpFormula({ ...c, formulaType: "pct_ticket_revenue", params: pct }).amount,0));
  });
  it("% líquida: 2% × (1000 + 3000)", () => { expect(computeMasterBpFormula({ formulaType: "pct_ticket_revenue", params: { ...pct,basis:"net" },cities }).amount).toBe(80); });
  it("per_head: real 10 + previsto 30, convites por estado", () => {
    const r = computeMasterBpFormula({ formulaType:"per_head",params:{unit_amount:1.5,include_courtesies:true,zone_ids:null}, cities:cities.map(c => ({...c,courtesies:[{zone_id:null,event_date_id:null,scenario:"forecast",quantity:8},{zone_id:null,event_date_id:null,scenario:"real",quantity:2}]})) });
    expect(r.amount).toBe(75); expect(r.cityBases).toEqual({a:12,b:38}); expect(r.composition.courtesiesSource).toBe("misto");
  });
  it("zonas de cidades diferentes: usa o real filtrado em cada cidade", () => { expect(computeMasterBpFormula({formulaType:"pct_ticket_revenue",params:{...pct,zone_ids:["za","zb"]},cities}).amount).toBe(31.8); });
  it("zona de outra cidade não inclui vendas fora do filtro", () => { expect(computeMasterBpFormula({formulaType:"pct_ticket_revenue",params:{...pct,zone_ids:["za"]},cities}).cityBases).toEqual({a:1060,b:0}); });
  it("mínimo só no total", () => { expect(computeMasterBpFormula({formulaType:"pct_ticket_revenue",params:{...pct,min:70},cities}).amount).toBe(84.8); });
  it("máximo só no total", () => { expect(computeMasterBpFormula({formulaType:"pct_ticket_revenue",params:{...pct,max:50},cities}).amount).toBe(50); });
  it("Master concluído não recalcula", () => { expect(canRecalculateFormulas({status:"completed",hasSealedSettlement:false})).toBe(false); });
  it("Master selado não recalcula", () => { expect(canRecalculateFormulas({status:"active",hasSealedSettlement:true})).toBe(false); });
  it("chão do realizado mantém 100 em vez de 84,80", () => { expect(applyRevenueFloor(84.8,100)).toEqual({amount:100,floorHit:true}); });
});
describe("#339 B3 — fatias partilhadas", () => {
  it("overhead proporcional; resto na última e soma exacta", () => {
    const r=overheadLinesFor(expandOverheadToSplits([formula()],events),"slices");
    expect(r.map(s=>s.amount)).toEqual([25,75.01]); expect(r.reduce((s,r)=>s+Number(r.amount),0)).toBe(100.01);
  });
  it("despesa adoptada segue a fórmula da linha Master", () => {
    const r=expandMasterAdoptedExpensesToSplits({events,forecasts:[formula(),...['a','b'].map(id=>({id:`f-${id}`,event_id:id,master_forecast_id:'f',transaction_id:'tx'}))],transactions:[{id:'tx',event_id:'m',type:'expense',amount:100.01}]});
    expect(r.map(s=>s.amount)).toEqual([25,75.01]);
  });
  it("sem fórmula conserva ÷N sem novo arredondamento", () => { expect(overheadLinesFor(expandOverheadToSplits([{id:'f',event_id:'m',amount:100.01,formula_type:'fixed'}],events),'slices').map(s=>s.amount)).toEqual([50.005,50.005]); });
  it("receita não adopta a proporção da fórmula de custo", () => { expect(masterFormulaShares({formula_type:'fixed'},['a','b'],100)).toBeNull(); });
  it("composição ausente não inventa ÷N para fórmula", () => { expect(()=>masterFormulaShares({formula_type:'per_head'},['a','b'],100)).toThrow(/por recalcular/); });
  it("base zero com montante zero dá zero", () => { expect(masterFormulaShares({formula_type:'per_head',formula_params:{master_city_bases:{a:0,b:0}}},['a','b'],0)?.amounts).toEqual([0,0]); });
  it("ordem de leitura diferente dá a mesma fatia ao cêntimo", () => {
    expect(masterFormulaShares(formula(),['b','a'],100.01)?.amounts).toEqual([75.01,25]);
  });
  it("cartões escalam BP e transação ligada pela mesma base", () => {
    const r=masterFormulaCostInputsForCity([formula()], [{id:'tx',forecast_id:'f',amount:200,type:'expense'}], ['a','b'],'a');
    expect(r?.forecasts[0].amount).toBe(25); expect(r?.transactions[0].amount).toBe(50);
  });
  it("cartões sem fórmulas ficam no caminho legado exacto", () => {
    expect(masterFormulaCostInputsForCity([{formula_type:'fixed',amount:100}],[],['a','b'],'a')).toBeNull();
  });
});
// SELECT Live 23/10/2026: overheads aprovados activos, sem fórmulas no Master.
describe("#339 B3 — regressão Live 23/10", () => {
  const rows = [
    {name:'SM',id:'5e56f568-506f-4469-8802-050182c6d479',amounts:[15000,1500,2000,2500,1000,3200,600],total:25800},
    {name:'Anitta',id:'fdfb39fe-45f2-43f5-9ec9-7cb536360ae1',amounts:[2500,15000,15000],total:32500},
    {name:'Tour M&M',id:'76250aba-2a10-4b3f-8482-c1db200d497f',amounts:[],total:0},
    {name:'Ghanem 2.0',id:'c1a2b3c4-2026-4000-8000-000000000001',amounts:[],total:0},
  ];
  for(const row of rows) it(`${row.name}: total e cada cidade iguais ao legado`,()=>{
    const overheads=row.amounts.map((amount,i)=>({id:String(i),event_id:row.id,amount,formula_type:'fixed'}));
    const expanded=expandOverheadToSplits(overheads,live.events);
    expect(overheadLinesFor(expanded,'originals').reduce((s,r)=>s+Number(r.amount),0)).toBe(row.total);
    const children=live.events.filter(e=>e.parent_event_id===row.id);
    for(const child of children) expect(expanded.filter(e=>e.event_id===child.id).reduce((s,r)=>s+Number(r.amount),0)).toBe(row.total/children.length);
  });
});