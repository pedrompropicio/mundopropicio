import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { AdsInvoiceImportDialog } from '@/components/ads/AdsInvoiceImportDialog';
const mock=vi.hoisted(()=>({invoke:vi.fn(),storage:vi.fn(),success:vi.fn(),warning:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mock.invoke},storage:{from:mock.storage}}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-user'},permissions:['manage_transactions'],role:'accountant',loading:false})}));
vi.mock('sonner',()=>({toast:{success:mock.success,warning:mock.warning}}));
const summary={invoice_number:'SYN-000001',billing_period:'2026-10-01',total_amount:20,lines_sum:20,currency:'USD',reconcilia:true,linhas:1,warnings:[]};
const company='48600000-0000-0000-0000-000000000001';
function setup(companyId=company){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const view=render(<QueryClientProvider client={client}><AdsInvoiceImportDialog companyId={companyId}/></QueryClientProvider>);return {...view,client};}
async function read(){fireEvent.click(screen.getByRole('button',{name:'Importar fatura'}));fireEvent.change(screen.getByLabelText('Ficheiro PDF da fatura'),{target:{files:[new File(['%PDF-synthetic'],'synthetic.pdf',{type:'application/pdf'})]}});fireEvent.click(screen.getByRole('button',{name:'Ler ficheiro'}));await screen.findByRole('button',{name:'Gravar proposta'});}
beforeEach(()=>{vi.clearAllMocks();mock.invoke.mockResolvedValue({data:summary,error:null});});afterEach(cleanup);
describe('#486 three-phase import and retoma UI',()=>{
  it('dry-run sends bytes without Storage writes and retains original currency',async()=>{
    setup();await read();expect(mock.storage).not.toHaveBeenCalled();expect(mock.invoke).toHaveBeenCalledTimes(1);expect(mock.invoke.mock.calls[0][1].body).toMatchObject({action:'parse_google',company_id:company,dry_run:true,file_base64:btoa('%PDF-synthetic')});expect(screen.getAllByText(/US/).length).toBeGreaterThan(0);
  });
  it('only explicit save sends the same bytes to the id-preserving RPC adapter',async()=>{
    setup();await read();const base64=mock.invoke.mock.calls[0][1].body.file_base64;
    mock.invoke.mockResolvedValue({data:{...summary,contract_version:1,invoice_id:'48600000-0000-0000-0000-000000000002',identical:true,source_verified:false},error:null});
    fireEvent.click(screen.getByRole('button',{name:'Gravar proposta'}));await waitFor(()=>expect(mock.success).toHaveBeenCalled());expect(mock.invoke.mock.calls[1][1].body).toEqual({action:'parse_google',file_base64:base64,company_id:company});expect(mock.warning).toHaveBeenCalledTimes(1);expect(mock.storage).not.toHaveBeenCalled();
  });
  it('does not allow non-reconciled imports',async()=>{mock.invoke.mockResolvedValue({data:{...summary,reconcilia:false},error:null});setup();await read();expect(screen.getByRole('button',{name:'Gravar proposta'})).toBeDisabled();expect(mock.invoke).toHaveBeenCalledTimes(1);});
  it('discards a late parse response after changing active company',async()=>{
    let resolve!:(v:any)=>void;mock.invoke.mockReturnValue(new Promise(r=>{resolve=r;}));const {rerender,client}=setup();
    fireEvent.click(screen.getByRole('button',{name:'Importar fatura'}));fireEvent.change(screen.getByLabelText('Ficheiro PDF da fatura'),{target:{files:[new File(['%PDF-test'],'test.pdf')]}});fireEvent.click(screen.getByRole('button',{name:'Ler ficheiro'}));await waitFor(()=>expect(mock.invoke).toHaveBeenCalledTimes(1));
    rerender(<QueryClientProvider client={client}><AdsInvoiceImportDialog companyId="48600000-0000-0000-0000-000000000009"/></QueryClientProvider>);resolve({data:summary,error:null});
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());fireEvent.click(screen.getByRole('button',{name:'Importar fatura'}));expect(screen.queryByText('SYN-000001')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Gravar proposta'})).not.toBeInTheDocument();
  });
});
