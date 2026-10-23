import { describe, expect, it } from "vitest";
import { loadMasterFormulaExpenseSlicesFor } from "@/lib/master-formula-load";
import { computeEventSettlementTotals } from "@/lib/event-settlement-inputs";

const events=[{id:'m'},{id:'a',parent_event_id:'m'},{id:'b',parent_event_id:'m'}];
const line={id:'f',event_id:'m',type:'expense',amount:100.01,iva_rate:0,status:'approved',is_overhead:true,exclude_from_result:true,formula_type:'pct_ticket_revenue',formula_params:{master_city_bases:{a:1,b:3}}};
function client(rows:any[]) {
  const tables:Record<string,any[]>={events,event_forecasts:rows,transactions:[]};
  return {from:(table:string)=>{
    let data=[...(tables[table]??[])];
    const q:any={select:()=>q,in:(k:string,v:any[])=>{data=data.filter(r=>v.includes(r[k]));return q},eq:(k:string,v:any)=>{data=data.filter(r=>r[k]===v);return q},is:(k:string,v:any)=>{data=data.filter(r=>(r[k]??null)===v);return q},order:()=>q,range:async(a:number,b:number)=>({data:data.slice(a,b+1),error:null}),then:(r:any)=>r({data,error:null})};return q;
  }};
}
describe('#339 B3 — leitor comum ERP/documento',()=>{
  it('cidade recebe overhead proporcional; raiz não recebe duplicados',async()=>{
    const db=client([line]);
    const city=await loadMasterFormulaExpenseSlicesFor(db,[events[1]]);
    expect(city.forecastSlices.map(f=>f.amount)).toEqual([25]);
    expect(await loadMasterFormulaExpenseSlicesFor(db,events)).toEqual({forecastSlices:[],transactionSlices:[]});
    const totals=computeEventSettlementTotals({events:[events[1]],transactions:[],forecasts:city.forecastSlices,ticketSales:[],basis:{includeOverhead:true,expenseSource:'committed'}});
    expect(totals.expensesNet).toBe(25);expect(totals.expensesGross).toBe(25);
  });
  it('sem fórmulas não acrescenta nem converte linhas fixas',async()=>{
    expect(await loadMasterFormulaExpenseSlicesFor(client([{...line,formula_type:'fixed'}]),[events[1]])).toEqual({forecastSlices:[],transactionSlices:[]});
  });
  it('marcação de fechamento mantém-se na fatia',async()=>{
    const slices=await loadMasterFormulaExpenseSlicesFor(client([{...line,event_settlement_id:'child-seal'}]),[events[1]]);
    expect(slices.forecastSlices[0].event_settlement_id).toBe('child-seal');
  });
});