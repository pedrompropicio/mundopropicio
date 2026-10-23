import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantConversation from "../components/data-entry/AssistantConversation";
import type { AssistantTurnResult, DataEntryAdapter } from "../lib/data-entry-client";
const context={user_id:"local-user",company_id:"local-company"};
const result:AssistantTurnResult={status:"select_message",text:"| Assunto | Hora |\n|---|---|\n| Fecho sintético | 16:28 |\n\n<script>unsafe()</script>\n\n![image](https://example.invalid/private)",trace:[],options:[{id:"msg000001",label:"Fecho sintético\nsender@example.invalid\n09/10/2026, 16:28 (Lisboa)"}],known_message_ids:["msg000001"],continuation:"synthetic-signed-selector",execution:{available:false,gaps:[]}};
beforeEach(()=>localStorage.clear());
describe("#333 leitura e continuação na UI",()=>{
  it("Markdown legível sem HTML executável ou imagens remotas",async()=>{
    render(<AssistantConversation context={context} adapter={{assistantTurn:vi.fn(async()=>result)} as unknown as DataEntryAdapter}/>);
    fireEvent.change(screen.getByLabelText("O que pretende fazer?"),{target:{value:"Pesquisa"}}); fireEvent.click(screen.getByRole("button",{name:"Enviar"}));
    await screen.findByRole("table"); expect(screen.getByRole("cell",{name:"16:28"})).toBeTruthy();
    expect(document.querySelector("script")).toBeNull(); expect(document.querySelector("img")).toBeNull(); expect(screen.queryByText("|---|---|")).toBeNull();
  });
  it.each(["cartão","texto"])("continuação por %s transporta o pedido assinado original",async mode=>{
    const call=vi.fn().mockResolvedValueOnce(result).mockResolvedValueOnce({...result,status:"answer",text:"O corpo foi cortado. Nada foi gravado.",continuation:undefined,options:undefined,review_message_id:"msg000001"});
    render(<AssistantConversation context={context} adapter={{assistantTurn:call,ticketlineCandidate:vi.fn()} as unknown as DataEntryAdapter}/>);
    fireEvent.change(screen.getByLabelText("O que pretende fazer?"),{target:{value:"Pesquisa original"}}); fireEvent.click(screen.getByRole("button",{name:"Enviar"}));
    const button=await screen.findByRole("button",{name:/sender@example.invalid[\s\S]*16:28/});
    if(mode==="cartão") fireEvent.click(button);
    else {fireEvent.change(screen.getByLabelText("O que pretende fazer?"),{target:{value:"Lê Fecho sintético 16:28"}});fireEvent.click(screen.getByRole("button",{name:"Enviar"}));}
    await waitFor(()=>expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1][0]).toMatchObject({continuation:"synthetic-signed-selector",continuation_text:"Pesquisa original",...(mode==="cartão"?{selection:{message_id:"msg000001"}}:{text:"Lê Fecho sintético 16:28"})});
    await screen.findByRole("button",{name:"Ver anexos deste email"});
  });
});