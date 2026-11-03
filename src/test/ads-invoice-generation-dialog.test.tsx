import { cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { AdsInvoiceGenerationDialog,type GenerationProps } from '@/components/ads/AdsInvoiceGenerationDialog';
import { emptyPlan,type InvoiceLine } from '@/lib/ads-invoice-generation';
const id=(n:number)=>`48600000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const line=(n:number,amount:number,adjustment=true):InvoiceLine=>({id:id(n),line_no:n,raw_description:`Synthetic ${n}`,amount,is_adjustment:adjustment,campaign_name:null,event_id:null,match_source:'none',match_note:null,event_split:null});
const forecast={id:id(20),event_id:id(10),category_id:id(30),description:'Campanha de lançamento',specification:'Tráfego próprio',amount:100,currency:'EUR',status:'approved'};
function preview(extra:any={}){return {contract_version:1,invoice_id:id(1),revision:1,generation_cycle:0,currency:'EUR',preview_hash:'a'.repeat(64),allocations:[],children:[],line_budgets:[],category_budgets:[],effects:[],blockers:[],totals:{invoice:'15.00',children:'15.00',outside:'0.00'},...extra};}
const serverChild=(key:string,amount:string,destination='company',allocations:any[]=[])=>({key,destination,event_id:destination==='event'?id(10):null,category_id:id(30),forecast_id:destination==='event'?id(20):null,new_forecast_key:null,amount,source_line_allocations:allocations});
const serverParcel=(n:number,amount:string)=>({key:`line${n}`,source_key:null,line_id:id(n),amount,prorated:false});
function setup(overrides:Partial<GenerationProps>={},pre=preview()){
  const request=vi.fn(async(action:string,payload:any)=>{
    if(action==='operation')return {contract_version:1,invoice_id:id(1),revision:0,generation_cycle:0,operation:null,maintenance:[]};
    if(action==='save_plan')return {contract_version:1,invoice_id:id(1),revision:1,generation_cycle:0,plan:payload.plan};
    if(action==='preview')return pre;
    if(action==='confirm')return {contract_version:1,invoice_id:id(1),revision:1,status:'confirmed'};
    if(action==='generate')return {contract_version:1,invoice_id:id(1),revision:1,generation_cycle:0,operation:null};
    throw new Error('unexpected action');
  });
  const props:GenerationProps={open:true,onClose:vi.fn(),invoiceId:id(1),companyId:id(2),scope:'companyA:userA:permissionsA',revision:0,status:'proposed',lines:[line(3,20),line(4,-5)],plan:null,
    events:[{id:id(10),name:'Master sintético',parent_event_id:null},{id:id(11),name:'Cidade sintética',parent_event_id:id(10)}],forecasts:[forecast],categoryId:id(30),canManage:true,canGenerate:true,canRaise:true,canCreate:true,request,onChanged:vi.fn(),...overrides};
  return {props,request,view:render(<AdsInvoiceGenerationDialog {...props}/>)};
}
async function ready(){await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'})).toBeEnabled());}
function destination(n:number,value:string){const field=screen.getByText(new RegExp(`^${n}\\. Synthetic`)).parentElement!;fireEvent.change(within(field).getByLabelText(/^Destino/),{target:{value}});return field;}
afterEach(cleanup);
describe('#486 actual destination/BP modal with synthetic transport',()=>{
  it('keeps signed fee/adjustment choices for company and outside through preview and submitted plan',async()=>{
    const {request}=setup({},preview({totals:{invoice:'15.00',children:'20.00',outside:'-5.00'},children:[serverChild('company','20.00','company',[serverParcel(3,'20.00')])]}));await ready();
    destination(3,'company');const out=destination(4,'outside');fireEvent.change(within(out).getByLabelText(/^Observação/),{target:{value:'Documento externo'}});
    expect(request.mock.calls.filter(c=>c[0]!=='operation')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'}));await screen.findByRole('region',{name:'Prévia do servidor'});
    const saved=request.mock.calls.find(c=>c[0]==='save_plan')![1];expect(saved.plan.allocations.map((a:any)=>[a.destination,a.amount,a.observation])).toEqual([['company','20.00',''],['outside','-5.00','Documento externo']]);
    expect(saved.plan.allocations.every((a:any)=>!a.event_id&&!a.forecast_id)).toBe(true);
    expect(screen.getByText(/Incluído 20.00 · Fora do sistema -5.00/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('preview',{expected_revision:1});
  });
  it('assigns a negative adjustment without campaign integrally to event/BP and clears BP on event change',async()=>{
    const {request}=setup({},preview({children:[serverChild('same_event','15.00','event',[serverParcel(3,'20.00'),serverParcel(4,'-5.00')])]}));await ready();
    const media=destination(3,'event');fireEvent.change(within(media).getByLabelText(/^Evento/),{target:{value:id(10)}});fireEvent.change(within(media).getByLabelText(/^Linha de BP/),{target:{value:id(20)}});
    let field=destination(4,'event');
    fireEvent.change(within(field).getByLabelText(/^Evento/),{target:{value:id(10)}});
    fireEvent.change(within(field).getByLabelText(/^Linha de BP/),{target:{value:id(20)}});
    expect(within(field).getByText(/Sem evidência inequívoca/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'}));await screen.findByRole('region',{name:'Prévia do servidor'});
    const saved=request.mock.calls.find(c=>c[0]==='save_plan')![1];expect(saved.plan.allocations.find((a:any)=>a.line_id===id(4))).toMatchObject({amount:'-5.00',destination:'event',event_id:id(10),forecast_id:id(20)});
    expect(within(screen.getByRole('region',{name:'Prévia do servidor'})).getByText(/Synthetic 4 · -5.00/)).toBeInTheDocument();
    fireEvent.change(within(field).getByLabelText(/^Evento/),{target:{value:id(11)}});expect(within(field).getByLabelText(/^Linha de BP/)).toHaveValue('');
    expect(screen.queryByRole('region',{name:'Prévia do servidor'})).not.toBeInTheDocument();
  });
  it('shows server batch BP100/70/20+20 as one raise10 and refuses omitted individual acceptance',async()=>{
    const effect={effect_id:`raise:${id(20)}`,kind:'raise',forecast_id:id(20),new_forecast_key:null,event_id:id(10),category_id:id(30),before:'100.00',delta:'10.00',after:'110.00',description:'Campanha de lançamento'};
    const p=preview({totals:{invoice:'40.00',children:'40.00',outside:'0.00'},children:[serverChild('batch','40.00','event',[serverParcel(3,'20.00'),serverParcel(4,'20.00')])],line_budgets:[{forecast_id:id(20),new_forecast_key:null,event_id:id(10),category_id:id(30),current:'100.00',committed:'70.00',incoming:'40.00',after:'0.00',shortfall:'10.00'}],effects:[effect]});
    const lines=[line(3,20,false),line(4,20,false)];const plan={...emptyPlan(),allocations:lines.map((l,i)=>({key:`part${i}`,line_id:l.id,destination:'event' as const,event_id:id(10),forecast_id:id(20),amount:'20.00',observation:''}))};
    const {request}=setup({lines,plan},p);await ready();fireEvent.click(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'}));await screen.findByText(/Compromisso 70.00/);
    expect(screen.getAllByText(/100.00 → 110.00/)).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Confirmar prévia'}));await screen.findByRole('button',{name:'Gerar lançamentos'});
    fireEvent.click(screen.getByRole('button',{name:'Gerar lançamentos'}));await screen.findByRole('alert');expect(request.mock.calls.filter(c=>c[0]==='generate')).toHaveLength(0);
    fireEvent.click(screen.getByLabelText(/Aceito este efeito/));fireEvent.change(screen.getByLabelText(/^Observação do efeito/),{target:{value:'Elevar 10 para o lote completo'}});
    fireEvent.click(screen.getByRole('button',{name:'Gerar lançamentos'}));await waitFor(()=>expect(request.mock.calls.filter(c=>c[0]==='generate')).toHaveLength(1));
    expect(request.mock.calls.find(c=>c[0]==='generate')![1].approvals).toEqual([{effect_id:effect.effect_id,accepted:true,observation:'Elevar 10 para o lote completo'}]);
  });
  it('collects every existing split parcel BP and permits a separate explicit purpose without an early write',async()=>{
    const split={...line(3,40,false),event_id:id(10),event_split:[{event_id:id(10),amount:20},{event_id:id(11),amount:20}]};
    const {request}=setup({lines:[split],forecasts:[forecast,{...forecast,id:id(21),event_id:id(11)}]});await ready();
    const bp=screen.getAllByLabelText(/^Linha de BP/);expect(bp).toHaveLength(2);fireEvent.change(bp[0],{target:{value:id(20)}});fireEvent.change(bp[1],{target:{value:'create'}});
    fireEvent.change(screen.getByLabelText(/^description new_/),{target:{value:'Lançamento da cidade'}});fireEvent.change(screen.getByLabelText(/^observation new_/),{target:{value:'Finalidade aprovada'}});
    expect(request.mock.calls.filter(c=>c[0]!=='operation')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'}));await screen.findByRole('region',{name:'Prévia do servidor'});
    const plan=request.mock.calls.find(c=>c[0]==='save_plan')![1].plan;expect(plan.allocations).toHaveLength(2);expect(plan.allocations[0].forecast_id).toBe(id(20));expect(plan.allocations[1].new_forecast_key).toBe(plan.new_forecasts[0].key);expect(plan.new_forecasts[0].description).toBe('Lançamento da cidade');
  });
  it('discards late save/preview results after active company or permission scope change',async()=>{
    let resolve!:(v:any)=>void;const pending=new Promise(r=>{resolve=r;});const change=vi.fn();
    const request=vi.fn(async(action:string,payload:any)=>action==='save_plan'?pending:{contract_version:1,invoice_id:id(1),revision:0,generation_cycle:0,operation:null});
    const {props,view}=setup({request,onChanged:change});await ready();destination(3,'company');destination(4,'company');fireEvent.click(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'}));
    view.rerender(<AdsInvoiceGenerationDialog {...props} scope="companyB:userA:denied" canManage={false}/>);
    resolve({contract_version:1,invoice_id:id(1),revision:1,generation_cycle:0,plan:emptyPlan()});await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'})).toBeDisabled());
    expect(change).not.toHaveBeenCalled();expect(request.mock.calls.filter(c=>c[0]==='preview')).toHaveLength(0);expect(screen.queryByRole('region',{name:'Prévia do servidor'})).not.toBeInTheDocument();
  });
  it('shows stale and closed errors without a legacy financial retry',async()=>{
    const request=vi.fn(async(action:string)=>{if(action==='operation')return {contract_version:1,invoice_id:id(1),revision:0,generation_cycle:0,operation:null};throw new Error('feature_disabled');});
    setup({request});await ready();destination(3,'company');destination(4,'company');fireEvent.click(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'}));expect(await screen.findByRole('alert')).toHaveTextContent('fechada');expect(request.mock.calls.map(c=>c[0])).toEqual(['operation','save_plan']);
  });
  it('creates a new split from the chosen Master in the same modal and clears each parcel BP',async()=>{
    const source={...line(3,40,false),event_id:null,match_source:'none'};
    const plan={...emptyPlan(),allocations:[{key:'source',line_id:source.id,destination:'event' as const,event_id:id(10),forecast_id:id(20),amount:'40.00',observation:'Master escolhido'}]};
    const request=vi.fn(async(action:string,payload:any)=>{
      if(action==='operation')return {contract_version:1,invoice_id:id(1),revision:0,generation_cycle:0,operation:null};
      if(action==='save_plan')return {contract_version:1,invoice_id:id(1),revision:1,plan:payload.plan};
      if(action==='set_split')return {ok:true,contract_version:1,invoice_id:id(1),revision:2,parts:2,cleared:false};
      throw new Error('unexpected');
    });
    setup({lines:[source],plan,request});await ready();fireEvent.click(screen.getByRole('button',{name:'Repartir pelo Master e cidades'}));
    fireEvent.change(screen.getByLabelText('Parcela Master sintético (partilhado)'),{target:{value:'20.00'}});fireEvent.change(screen.getByLabelText('Parcela Cidade sintética'),{target:{value:'20.00'}});
    expect(request.mock.calls.filter(c=>c[0]!=='operation')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Guardar plano e repartição'}));
    await waitFor(()=>expect(screen.getAllByLabelText(/^Linha de BP/)).toHaveLength(2));expect(screen.getAllByLabelText(/^Linha de BP/).every(e=>(e as HTMLSelectElement).value==='')).toBe(true);
    expect(request.mock.calls.find(c=>c[0]==='set_split')![1]).toEqual({expected_revision:1,line_id:id(3),parts:[{event_id:id(10),amount:'20.00',source:'manual'},{event_id:id(11),amount:'20.00',source:'manual'}]});
  });
  it('reads operation after uncertain generation and retains the same hash-bound request on explicit retry',async()=>{
    let revision=0;
    const request=vi.fn(async(action:string,payload:any)=>{
      if(action==='operation')return {contract_version:1,invoice_id:id(1),revision,generation_cycle:0,operation:null};
      if(action==='save_plan'){revision=1;return {contract_version:1,invoice_id:id(1),revision,plan:payload.plan};}
      if(action==='preview')return preview({children:[serverChild('company','15.00','company',[serverParcel(3,'20.00'),serverParcel(4,'-5.00')])]});
      if(action==='confirm')return {contract_version:1,invoice_id:id(1),revision:1,status:'confirmed'};
      throw new Error('Pedido sem resposta. Consulte a operação.');
    });
    setup({request});await ready();destination(3,'company');destination(4,'company');fireEvent.click(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'}));await screen.findByRole('region',{name:'Prévia do servidor'});
    fireEvent.click(screen.getByRole('button',{name:'Confirmar prévia'}));await screen.findByRole('button',{name:'Gerar lançamentos'});fireEvent.click(screen.getByRole('button',{name:'Gerar lançamentos'}));await screen.findByRole('alert');
    expect(request.mock.calls.filter(c=>c[0]==='generate')).toHaveLength(1);expect(request.mock.calls[request.mock.calls.length-1][0]).toBe('operation');
    fireEvent.click(screen.getByRole('button',{name:'Gerar lançamentos'}));await waitFor(()=>expect(request.mock.calls.filter(c=>c[0]==='generate')).toHaveLength(2));
    const calls=request.mock.calls.filter(c=>c[0]==='generate');expect(calls[1][1]).toEqual(calls[0][1]);
  });
  it('shows non-positive composition blockers and retains every signed adjustment in preview',async()=>{
    const plan={...emptyPlan(),allocations:[{key:'fee',line_id:id(3),destination:'event' as const,event_id:id(10),forecast_id:id(20),amount:'20.00',observation:''},{key:'adjustment',line_id:id(4),destination:'company' as const,amount:'-5.00',observation:'Ajuste empresarial explícito'}]};
    setup({plan},preview({children:[serverChild('event','20.00','event',[serverParcel(3,'20.00')]),serverChild('company','-5.00','company',[serverParcel(4,'-5.00')])],blockers:[{code:'unsupported_financial_shape'}]}));
    await ready();fireEvent.click(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'}));expect(await screen.findByRole('alert')).toHaveTextContent('não positivo');
    expect(within(screen.getByRole('region',{name:'Prévia do servidor'})).getByText(/Synthetic 4 · -5.00/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Confirmar prévia'})).not.toBeInTheDocument();
  });
  it('does not borrow a newer operation revision to overwrite stale local choices',async()=>{
    const request=vi.fn(async()=>({contract_version:1,invoice_id:id(1),revision:9,generation_cycle:0,operation:null}));
    setup({request});expect(await screen.findByRole('alert')).toHaveTextContent('Outra pessoa alterou');
    expect(screen.getByRole('button',{name:'Guardar escolhas e atualizar prévia'})).toBeDisabled();expect(request.mock.calls).toHaveLength(1);
  });
});
