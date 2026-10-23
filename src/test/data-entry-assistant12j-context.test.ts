import { describe, expect, it, vi } from "vitest";
import { runAssistantTurn, resolveTextMessage, emailDateTime, type AssistantModel } from "../../supabase/functions/_shared/assistant-orchestrator";
import { createAssistantModel } from "../../supabase/functions/_shared/issue333-ai/assistant-model";
import { signContinuation, verifyContinuation, requestHash } from "../../supabase/functions/_shared/assistant-continuation";
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";

const filters = { from_date: "2026-09-23", to_date: "2026-10-23", sender: "example.invalid", page_size: 20 };
const emails = Array.from({ length: 4 }, (_, i) => ({ message_id: `msg00000${i}`, subject: "Fecho sintético", from: "sender@example.invalid", date: `2026-10-09T15:${28-i}:00Z`, attachments: Array.from({ length: 12 }, (_, j) => ({ part_id: `${j}`, filename: `anexo-m${i}-${j}-`+"x".repeat(110), mime: "application/pdf", size_bytes: 1000 })) }));
const resume = { user: "local", company: "local", expires: Date.now()+60000, requestHash: "synthetic", filters, messages: emails.map(m=>m.message_id), events: [], message: null };
const signal = () => new AbortController().signal;
const body = (truncated: boolean) => ({ message_id: emails[0].message_id, subject: emails[0].subject, from: emails[0].from, date: emails[0].date, kind: "plain" as const, body_text: "á".repeat(4000), truncated });
function response(text = JSON.stringify({ type:"final", name:null, args_json:null, text:"Resposta segura." }), total = 3045) {
  const item={ type:"message",id:"msg_local",role:"assistant",content:[{type:"output_text",text,annotations:[]}] };
  const frames=[{type:"response.created",response:{id:"resp_local",model:"openai/gpt-6-astra",created_at:0}},{type:"response.output_item.added",output_index:0,item},{type:"response.content_part.added",item_id:item.id,output_index:0,content_index:0,part:{type:"output_text",text:"",annotations:[]}},{type:"response.output_text.delta",item_id:item.id,output_index:0,content_index:0,delta:text},{type:"response.output_item.done",output_index:0,item},{type:"response.completed",response:{id:"resp_local",model:"openai/gpt-6-astra",output:[item],usage:{input_tokens:total-39,output_tokens:39,total_tokens:total,output_tokens_details:{reasoning_tokens:0}}}}];
  return new Response(frames.map(f=>`data: ${JSON.stringify(f)}\n\n`).join(""),{headers:{"Content-Type":"text/event-stream"}});
}
describe("#333 12j contexto sintético (sem rede)",()=>{
  it("não cobra a reserva máxima de saída como consumo após resposta completa",async()=>{
    const f=vi.fn(async()=>response());
    const m=createAssistantModel({apiKey:"local-not-a-key",validateContext:async()=>{},fetch:f,control:{run:async(_s,_v,call)=>call({beforePost:async()=>{},received:()=>{},completed:()=>{}})} });
    const input={contract:"local",tools:[],messages:[{role:"user" as const,content:"á".repeat(5000)}],signal:signal()};
    await m.next(input); await m.next(input); await m.next(input);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("retoma não envia anexos nem histórico inteiro e mantém seleção revalidada",async()=>{
    const next=vi.fn<AssistantModel["next"]>(async()=>({step:{type:"final" as const,text:"ok"},tokens:1}));
    const search=vi.fn(async()=>({messages:emails,next_page_token:null}));
    const r=await runAssistantTurn({next},{resume,gmailSearch:search,gmailRead:vi.fn(),erpContext:vi.fn()},{text:"Lê o escolhido",selection:{message_id:emails[0].message_id},history:Array.from({length:12},()=>({role:"assistant" as const,text:"histórico".repeat(250)}))},signal());
    expect(r.status).toBe("answer"); expect(search).toHaveBeenCalledTimes(1);
    const context=JSON.stringify(next.mock.calls[0]);
    for (const o of ["anexo-m1-","anexo-m2-","anexo-m3-"]) expect(context).not.toContain(o); // só os anexos do email escolhido expect(context.length).toBeLessThan(7000);
  });
  it("corpo cortado termina sem outra chamada, proposta ou consulta ERP e encaminha revisão existente",async()=>{
    const next=vi.fn(async()=>({step:{type:"tool" as const,name:"gmail_read",args:{message_id:emails[0].message_id}},tokens:1}));
    const erp=vi.fn(); const read=vi.fn(async()=>body(true));
    const r=await runAssistantTurn({next},{resume,gmailSearch:async()=>({messages:emails,next_page_token:null}),gmailRead:read,erpContext:erp},{text:"Lê",history:[],selection:{message_id:emails[0].message_id}},signal());
    expect(r.status).toBe("answer"); expect(r.text).toMatch(/4000|4.000/); expect(r.proposal).toBeUndefined(); expect(r.review_message_id).toBe(emails[0].message_id);
    expect(next).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1); expect(erp).not.toHaveBeenCalled();
  });
  it("tentativa de refazer pesquisa após seleção devolve a seleção atual sem loop",async()=>{
    const search=vi.fn(async()=>({messages:emails,next_page_token:null}));
    const next=vi.fn(async()=>({step:{type:"tool" as const,name:"gmail_search",args:filters},tokens:1}));
    const r=await runAssistantTurn({next},{resume,gmailSearch:search,gmailRead:vi.fn(),erpContext:vi.fn()},{text:"Lê",history:[],selection:{message_id:emails[0].message_id}},signal());
    expect(search).toHaveBeenCalledTimes(1); expect(next).toHaveBeenCalledTimes(1); expect(r.status).toBe("select_message");
  });
  it.each([false,true])("pesquisa → seleção → corpo4000 truncado=%s → resposta útil com SDK real e HTTP sintético",async truncated=>{
    const tool = (name:string,args:unknown)=>JSON.stringify({type:"tool",name,args_json:JSON.stringify(args),text:null});
    const replies=[tool("gmail_search",filters),tool("gmail_read",{message_id:emails[0].message_id}),JSON.stringify({type:"final",name:null,args_json:null,text:"Li o email completo; nada foi gravado."})];
    const calls: Record<string,unknown>[]=[];
    const factory=()=>createAssistantModel({apiKey:"local-not-a-key",validateContext:async()=>{},fetch:async(_u,init)=>{calls.push(JSON.parse(String(init?.body))); return response(replies[calls.length-1]);},control:{run:async(_s,_v,call)=>call({beforePost:async()=>{},received:()=>{},completed:()=>{}})}});
    const search=vi.fn(async()=>({messages:emails,next_page_token:null})); const read=vi.fn(async()=>body(truncated)); const erp=vi.fn();
    const first=await runAssistantTurn(factory(),{gmailSearch:search,gmailRead:read,erpContext:erp},{text:"Pesquisa fechos",history:[]},signal());
    expect(first.status).toBe("select_message");
    const second=await runAssistantTurn(factory(),{resume,gmailSearch:search,gmailRead:read,erpContext:erp},{text:"Lê o email mais recente com assunto Fecho sintético",history:Array.from({length:12},()=>({role:"assistant" as const,text:"Histórico sintético com tabela e falhas ".repeat(70)}))},signal());
    expect(second.status).toBe("answer"); expect(calls).toHaveLength(truncated?2:3); expect(search).toHaveBeenCalledTimes(2); expect(read).toHaveBeenCalledTimes(1); expect(erp).not.toHaveBeenCalled(); expect(second.proposal).toBeUndefined();
    for (const o of ["anexo-m1-","anexo-m2-","anexo-m3-"]) expect(JSON.stringify(calls)).not.toContain(o);
    if (!truncated) expect(JSON.stringify(calls[2])).toContain("á".repeat(4000));
  });
  it("seleção textual é inequívoca por assunto/hora; ambiguidade e datas sem hora não são adivinhadas",()=>{
    expect(resolveTextMessage("Lê Fecho sintético 16:28",emails)).toBe(emails[0].message_id);
    expect(resolveTextMessage("Lê Fecho sintético",emails)).toBeNull();
    expect(resolveTextMessage("Lê o mais recente Fecho sintético",emails.map(m=>({...m,date:"2026-10-09"})))).toBeNull();
    expect(emailDateTime(emails[0].date)).toContain("16:28");
    expect(resolveTextMessage("Lê outra mensagem",emails)).toBeNull();
  });
  it("continuação mantém assinatura, owner, empresa, pedido original e prazo",async()=>{
    const secret="local-synthetic-secret-only-32-chars";
    const state={...resume,expires:2000,requestHash:await requestHash("Pedido original")};
    const token=await signContinuation(state,secret);
    expect(await verifyContinuation(token,secret,{user:resume.user,company:resume.company},"Pedido original",1000)).toEqual(state);
    for(const [ctx,text,time] of [[{user:"outro",company:resume.company},"Pedido original",1000],[{user:resume.user,company:"outra"},"Pedido original",1000],[{user:resume.user,company:resume.company},"outro pedido",1000],[{user:resume.user,company:resume.company},"Pedido original",2000]] as const)
      await expect(verifyContinuation(token,secret,ctx,text,time)).rejects.toThrow();
  });
  it("consumo real acumulado mantém teto40000; pedido sem espaço não faz HTTP",async()=>{
    const f=vi.fn(async()=>response()); const m=createAssistantModel({apiKey:"local-not-a-key",validateContext:async()=>{},fetch:f,control:{run:async(_s,_v,call)=>call({beforePost:async()=>{},received:()=>{},completed:()=>{}})}});
    const input={contract:"local",tools:[],messages:[{role:"user" as const,content:"olá"}],signal:signal()};
    for(let i=0;i<13;i++) await m.next(input);
    await expect(m.next(input)).rejects.toThrow(/Limite/); expect(f).toHaveBeenCalledTimes(13);
  });
  it("handler aceita texto novo apenas com assinatura do pedido original; source/owner/empresa revalidados",async()=>{
    const user="22222222-2222-4222-8222-222222222222", company="11111111-1111-4111-8111-111111111111";
    const secret="local-synthetic-secret-only-32-chars";
    const token=await signContinuation({...resume,user,company,requestHash:await requestHash("Pesquisa original")},secret);
    const read=vi.fn(async()=>body(true)); const search=vi.fn(async()=>({messages:emails,next_page_token:null}));
    const model:AssistantModel={next:async()=>({step:{type:"tool",name:"gmail_read",args:{message_id:emails[0].message_id}},tokens:1})};
    const d:Deps={uploadEnabled:false,pilotScoped:true,cors:{},getUser:async()=>({id:user}),userRpc:async(_t,n)=>({data:n==="my_effective_permissions"?{role:"manager",company_id:company}:{preparation:false,execute:false},error:null}),recordReceipt:vi.fn(),storage:{upload:vi.fn(),download:vi.fn()},assistantEnabled:true,assistantScopeAllowed:async()=>true,continuationSecret:secret,assistant:{model,erpContext:vi.fn()},gmail:{reader:async()=>({search,read,attachment:vi.fn(),attachments:vi.fn(async()=>[])})}};
    const request=(extra:Record<string,unknown>)=>new Request("http://local.invalid",{method:"POST",headers:{Authorization:"Bearer local-only","Content-Type":"application/json"},body:JSON.stringify({action:"assistant_turn",text:"Lê Fecho sintético 16:28",history:[],continuation:token,...extra})});
    const handler=createHandler(d);
    const r=await handler(request({continuation_text:"Pesquisa original"}));
    expect(r.status).toBe(200); expect((await r.json()).review_message_id).toBe(emails[0].message_id); expect(read).toHaveBeenCalledTimes(1);
    expect((await handler(request({continuation_text:"Outro pedido"}))).status).toBe(409);
    d.assistantScopeAllowed=async()=>false;
    expect((await handler(request({continuation_text:"Pesquisa original"}))).status).toBe(503);
    expect(search).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1); expect(d.storage.upload).not.toHaveBeenCalled();
  });
});