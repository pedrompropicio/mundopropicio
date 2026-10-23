import { describe, expect, it, vi, beforeEach } from "vitest";
const state=vi.hoisted(()=>({status:'active',sealed:false,options:null as any,write:vi.fn()}));
vi.mock("@tanstack/react-query",()=>({useQuery:(options:any)=>{state.options=options;return {}},useQueryClient:()=>({invalidateQueries:vi.fn()})}));
vi.mock("react",async importOriginal=>({...await importOriginal<any>(),useRef:()=>({current:false}),useEffect:()=>{}}));
vi.mock("@/lib/forecast-amount",()=>({writeForecastAmount:state.write,ForecastBelowRealizedError:class extends Error{}}));
vi.mock("@/lib/supabase-paging",()=>({fetchAllPagedQuery:async()=>({data:[{id:'f',type:'expense',amount:100,formula_type:'pct_ticket_revenue',formula_params:{rate:2,basis:'gross',zone_ids:null}}],error:null}),fetchAllPaged:async()=>[]}));
vi.mock("@/lib/event-revenue-basis",()=>({fetchEventRealized:async(id:string)=>id==='a'}));
vi.mock("@/lib/event-simulator-forecast-live",()=>({computeLiveTicketForecast:async()=>({gross:3000,net:3000,totalQty:30})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
  let field='',eqId='';const q:any={select:()=>q,eq:(f:string,v:string)=>{field=f;eqId=v;return q},is:()=>q,not:()=>q,limit:()=>q,order:()=>q,maybeSingle:async()=>({data:{status:state.status},error:null}),then:(resolve:any)=>resolve({data:table==='event_settlements'?(state.sealed?[{id:'seal'}]:[]):table==='events'&&field==='parent_event_id'&&eqId==='m'?[{id:'a'},{id:'b'}]:[],error:null})};return q;
}}}));
import { useSyncFormulaForecasts } from "@/hooks/useSyncFormulaForecasts";
beforeEach(()=>{state.status='active';state.sealed=false;state.write.mockClear();});
describe('#339 B3 — recálculo real do hook Master (inert)',()=>{
  it('Master aberto calcula pela soma do motor de cada cidade',async()=>{
    useSyncFormulaForecasts({eventId:'m',isMaster:true});const r=await state.options.queryFn();
    expect(r.masterBlocked).toBe(false);expect(r.evals[0].result.amount).toBe(60);expect(r.evals[0].cityBases).toEqual({a:0,b:3000});expect(state.write).not.toHaveBeenCalled();
  });
  it('Master concluído pára antes de avaliar ou escrever',async()=>{
    state.status='completed';useSyncFormulaForecasts({eventId:'m',isMaster:true});const r=await state.options.queryFn();
    expect(r.frozen).toBe(true);expect(r.evals).toEqual([]);expect(state.write).not.toHaveBeenCalled();
  });
  it('Master selado pára antes de avaliar ou escrever',async()=>{
    state.sealed=true;useSyncFormulaForecasts({eventId:'m',isMaster:true});const r=await state.options.queryFn();
    expect(r.frozen).toBe(true);expect(r.evals).toEqual([]);expect(state.write).not.toHaveBeenCalled();
  });
});