import { describe,expect,it } from 'vitest';
import { decimalFromDatabase,parsePlan,parsePreview,validateApprovals,initialAllocations,emptyPlan } from '../ads-invoice-generation';
import { adsMessages,adsError,formatAdsMoney } from '../ads-invoice-messages';
const id=(n:number)=>`48600000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const allocation={key:'fee',line_id:id(1),destination:'company',amount:'20.00',observation:''};
describe('#486 shared D1 contract',()=>{
  it.each(['20.00','-10.01','0.00','999999999999.99'])('accepts exact signed cents %s',amount=>expect(parsePlan({...emptyPlan(),allocations:[{...allocation,amount}]}).allocations[0].amount).toBe(amount));
  it.each([20,'20','20.001','01.00','1e2','NaN','1000000000000.00'])('refuses non-contract money %s',amount=>expect(()=>parsePlan({...emptyPlan(),allocations:[{...allocation,amount}]})).toThrow());
  it('converts representation without rounding fractional cents',()=>{expect(decimalFromDatabase(-10.1)).toBe('-10.10');expect(()=>decimalFromDatabase(0.001)).toThrow();});
  it('distinguishes company included from outside with required reason',()=>{
    expect(parsePlan({...emptyPlan(),allocations:[allocation]}).allocations[0].destination).toBe('company');
    expect(()=>parsePlan({...emptyPlan(),allocations:[{...allocation,destination:'outside'}]})).toThrow();
    expect(parsePlan({...emptyPlan(),allocations:[{...allocation,destination:'outside',observation:'Documento de terceiro'}]}).allocations[0].amount).toBe('20.00');
  });
  it('rejects approvals in the plan, duplicate keys and cross-destination BP',()=>{
    expect(()=>parsePlan({...emptyPlan(),approvals:[]})).toThrow();
    expect(()=>parsePlan({...emptyPlan(),allocations:[allocation,allocation]})).toThrow();
    expect(()=>parsePlan({...emptyPlan(),allocations:[{...allocation,forecast_id:id(2)}]})).toThrow();
  });
  it('requires one explicit BP or new purpose for event',()=>{
    expect(()=>parsePlan({...emptyPlan(),allocations:[{...allocation,destination:'event',event_id:id(2)}]})).toThrow();
    expect(parsePlan({...emptyPlan(),allocations:[{...allocation,destination:'event',event_id:id(2),forecast_id:id(3)}]}).allocations[0].forecast_id).toBe(id(3));
  });
  it('never defaults unresolved lines to company and preserves split IDs/negative choices',()=>{
    const line={id:id(1),line_no:1,raw_description:'Synthetic fee',amount:20,is_adjustment:true,campaign_name:'campaign',event_id:null,match_source:'none',match_note:null,event_split:null};
    expect(initialAllocations([line],null)).toEqual([]);
    const persisted=parsePlan({...emptyPlan(),allocations:[{...allocation,amount:'-20.00'}]});expect(initialAllocations([],persisted)).toEqual(persisted.allocations);
  });
  it('requires exact individual acceptances with observations',()=>{
    const effects=[{effect_id:'raise:one'},{effect_id:'create:two'}] as any;
    expect(()=>validateApprovals(effects,[{effect_id:'raise:one',accepted:true,observation:'Lote'}])).toThrow();
    expect(()=>validateApprovals(effects,[{effect_id:'raise:one',accepted:true,observation:'Lote'},{effect_id:'create:two',accepted:false,observation:'Fim'}])).toThrow();
    expect(()=>validateApprovals(effects,[{effect_id:'raise:one',accepted:true,observation:' '},{effect_id:'create:two',accepted:true,observation:'Fim'}])).toThrow();
    expect(validateApprovals(effects,[{effect_id:'create:two',accepted:true,observation:'Finalidade'},{effect_id:'raise:one',accepted:true,observation:'Lote'}]).map(a=>a.effect_id)).toEqual(['create:two','raise:one']);
  });
  it('fails closed on absent server arrays or numeric totals',()=>{
    const p={contract_version:1,invoice_id:id(1),revision:1,generation_cycle:0,currency:'EUR',preview_hash:'a'.repeat(64),allocations:[],children:[],line_budgets:[],category_budgets:[],effects:[],blockers:[],totals:{invoice:'20.00',children:'20.00',outside:'0.00'}};
    expect(parsePreview(p).totals.invoice).toBe('20.00');expect(()=>parsePreview({...p,line_budgets:undefined})).toThrow();expect(()=>parsePreview({...p,totals:{...p.totals,invoice:20}})).toThrow();expect(()=>parsePreview(p,id(2))).toThrow();
  });
  it('has actionable PT-PT closed/stale/identity/negative-composition messages and original currency',()=>{
    for(const code of ['feature_disabled','preview_stale','financial_source_required','unsupported_financial_shape','revert_blocked'])expect(adsError(new Error(code))).toBe(adsMessages.errors[code]);
    expect(formatAdsMoney(20,'USD')).toContain('US');expect(adsMessages.companyHelp).toContain('Incluído');expect(adsMessages.outsideHelp).toContain('Excluído');
  });
});
