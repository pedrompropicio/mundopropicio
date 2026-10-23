import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BpFormulaPanel } from "@/components/BpFormulaPanel";

const mocks = vi.hoisted(() => ({ update: vi.fn(), paged: vi.fn(), sync: vi.fn() }));
vi.mock("@/hooks/useSyncFormulaForecasts", () => ({ useSyncFormulaForecasts: () => ({data:{lines:[],evals:[],forbidden:[],frozen:false}}), evaluateEventFormulas: async () => [] }));
vi.mock("@/components/EventCourtesiesEditor", () => ({ EventCourtesiesEditor: () => null }));
vi.mock("@/lib/supabase-paging", () => ({fetchAllPagedQuery: () => mocks.paged()}));
vi.mock("@/integrations/supabase/client", () => ({supabase:{from:()=>{
  const q:any={select:()=>q,eq:()=>q,is:()=>q,in:()=>q,order:()=>q,update:(p:any)=>{mocks.update(p);return q},then:(resolve:any)=>resolve({data:[],error:null})}; return q;
}}}));
beforeEach(()=>{cleanup();mocks.update.mockClear();mocks.paged.mockResolvedValue({data:[{id:'oh',type:'expense',description:'Comissão',amount:100,is_overhead:true,formula_type:'fixed',formula_params:null,account_categories:{code:'2.6.07'}}],error:null});});
async function save(overheadOnly:boolean,kind:'pct'|'head'){
  const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  render(<QueryClientProvider client={qc}><BpFormulaPanel eventId="m" isMaster canEdit overheadOnly={overheadOnly}/></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Definir fórmula…'}));
  await screen.findByRole('option',{name:/Comissão/});
  fireEvent.change(screen.getAllByRole('combobox')[0],{target:{value:'oh'}});
  if(kind==='head'){
    fireEvent.click(screen.getByRole('button',{name:'Custo por pessoa'}));
    fireEvent.change(screen.getByPlaceholderText('€ / pessoa'),{target:{value:'1,50'}});
  }
  fireEvent.click(screen.getByRole('button',{name:'Gravar'}));
  await waitFor(()=>expect(mocks.update).toHaveBeenCalledTimes(1));
  const patch=mocks.update.mock.calls[0][0]; cleanup();qc.clear();return patch;
}
describe('#339 B3 — mesma gravação BP/Overhead',()=>{
  it('% da bilheteira grava os mesmos campos nos dois separadores',async()=>{
    const bp=await save(false,'pct');mocks.update.mockClear();const oh=await save(true,'pct');
    expect(oh).toEqual(bp);expect(oh).toEqual({formula_type:'pct_ticket_revenue',formula_params:{rate:2,basis:'gross',zone_ids:null,min:null,max:null}});
  });
  it('por pessoa grava os mesmos campos nos dois separadores',async()=>{
    const bp=await save(false,'head');mocks.update.mockClear();const oh=await save(true,'head');
    expect(oh).toEqual(bp);expect(oh).toEqual({formula_type:'per_head',formula_params:{unit_amount:1.5,include_courtesies:true,zone_ids:null,min:null,max:null}});
  });
});