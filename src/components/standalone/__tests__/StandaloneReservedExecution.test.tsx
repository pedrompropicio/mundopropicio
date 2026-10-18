import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StandaloneReservedExecution } from "../StandaloneReservedExecution";
const api = vi.hoisted(() => ({ resume: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/standalone-attempt-client", () => ({ resumeLegacyAttempt: api.resume, executeLegacyAttempt: api.execute }));
const context = {user_id:"local-owner",company_id:"local-company"};
beforeEach(() => { api.resume.mockReset(); api.execute.mockReset(); });
describe("#333 explicit prepared reservation authorization", () => {
  it.each(["authorized", "inprogress", "completed", "review"])("%s is never executed as a fresh prepared reservation", async state => {
    api.resume.mockResolvedValue({attempt:{state}});
    render(<StandaloneReservedExecution id="id" hash="hash" context={context} onChecked={()=>{throw Error("false success")}}/>);
    fireEvent.change(screen.getByLabelText("Documento original da reserva"),{target:{files:[new File(["fixture"],"f.pdf",{type:"application/pdf"})]}});
    fireEvent.click(screen.getByRole("button",{name:"Autorizar execução da reserva preparada"}));
    await waitFor(()=>expect(api.resume).toHaveBeenCalledTimes(1));
    await screen.findByText("Consulta o resultado; esta reserva não permite uma nova execução.");
    expect(api.execute).not.toHaveBeenCalled();
  });
  it("requires explicit action and checks the typed endpoint once despite double click",async()=>{
    api.resume.mockResolvedValue({attempt:{state:"prepare",id:"id",hash:"hash"}});
    api.execute.mockResolvedValue({status:"conferido"});const checked=vi.fn();
    render(<StandaloneReservedExecution id="id" hash="hash" context={context} onChecked={checked}/>);
    const file=new File(["fixture"],"f.pdf",{type:"application/pdf"});
    fireEvent.change(screen.getByLabelText("Documento original da reserva"),{target:{files:[file]}});
    expect(api.execute).not.toHaveBeenCalled();
    const button=screen.getByRole("button",{name:"Autorizar execução da reserva preparada"});fireEvent.click(button);fireEvent.click(button);
    await waitFor(()=>expect(checked).toHaveBeenCalledTimes(1));expect(api.execute).toHaveBeenCalledExactlyOnceWith("scanner_create",{state:"prepare",id:"id",hash:"hash"},file,context);
  });
});