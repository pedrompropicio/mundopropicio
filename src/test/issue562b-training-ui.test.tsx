import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ training: false }));
vi.mock('@/hooks/useCompany', () => ({
  useCompany: () => ({ company: { display_name: 'Empresa sintética', is_training: state.training }, companyId: 'fixture', isPlatformAdmin: true }),
  useCompaniesList: () => ({ data: [{ id: 'fixture', display_name: 'Empresa sintética', is_training: state.training }] }),
  useUserMemberships: () => ({ data: [] }),
  useSetActiveCompany: () => ({ isPending: false }),
  useProfileActiveCompanyId: () => ({ data: 'fixture' }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { TrainingBanner } from '@/components/TrainingBanner';
import { buildPain001, type SepaFileInput } from '@/lib/sepa/pain001';
import { readFileSync } from 'node:fs';
import { CompanySwitcher } from '@/components/CompanySwitcher';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const input: SepaFileInput = {
  listId:'fixture',listTitle:'Lista sintética',debtorName:'Empresa sintética',
  debtorIban:'PT50000000000000000000000',debtorBic:'TESTPTPL',executionDate:'2030-01-04',
  rows:[{transactionId:'10000000-0000-0000-0000-000000000001',creditorName:'Fornecedor sintético',iban:'PT50000000000000000000000',amount:12.34,remittance:'Exercício sintético'}],
  now:new Date('2030-01-02T12:00:00Z'),
};
afterEach(()=>{state.training=false});
describe('issue562 UI and exports', () => {
  it('real company selector DOM retains its hash captured before edits on dc211150e', () => {
    const dom = renderToStaticMarkup(<CompanySwitcher />);
    expect(digest(dom)).toBe('c1d5ca50e12039f0e1946d850667ddc92a38232e741629ab79947c0a55e3f1c2');
    expect(dom).not.toContain('TREINO');
  });
  it('banner has no DOM for real/absent companies; flag alone shows training', () => {
    expect(renderToStaticMarkup(<TrainingBanner company={null} />)).toBe('');
    expect(renderToStaticMarkup(<TrainingBanner company={{}} />)).toBe('');
    expect(renderToStaticMarkup(<TrainingBanner company={{is_training:false}} />)).toBe('');
    const html=renderToStaticMarkup(<TrainingBanner company={{is_training:true}} />);
    expect(html).toContain('AMBIENTE DE TREINO — nada aqui é real');
    expect(html).toContain('role="status"');
    state.training=true;
    expect(renderToStaticMarkup(<CompanySwitcher />)).toContain('TREINO');
  });
  it('real XML, filename and MsgId keep baseline bytes captured from HEAD before edits', () => {
    const out=buildPain001(input);
    expect(digest(buildPain001({...input,rows:[]}).xml)).toBe('1db69e23689bfe1493acfd7e13d1be3678113980b711d050ef469bfa45127c5f');
    expect(digest(out.xml)).toBe('0b7f65c17737bf90ea13781a3200d7017fcb38b171eaccf0824bf952ec989ed1');
    expect(out.fileName).toBe('transferencias_lista-sintetica_20300104.xml');
    expect(out.msgId).toBe('PAGAMENTOS-MP-04012030-02011200');
    expect(buildPain001({...input,isTraining:false})).toEqual(out);
  });
  it('training marks MsgId, PmtInfId and filename, retains amounts and test suffix', () => {
    const out=buildPain001({...input,isTraining:true,isTest:true});
    expect(out.msgId).toMatch(/^TREINO-/);
    expect(out.msgId.length).toBeLessThanOrEqual(32);
    expect(out.fileName).toBe('transferencias_lista-sintetica_20300104_TESTE_TREINO.xml');
    expect(out.xml).toContain(`<MsgId>${out.msgId}</MsgId>`);
    expect(out.xml).toContain(`<PmtInfId>${out.msgId}-P1</PmtInfId>`);
    expect(out.controlSum).toBe('12.34');
  });
  it('SEPA download-only return precedes history/auth/payment callback; accounting downloads are marked and return before registration', () => {
    const sepa=readFileSync('src/components/SepaExportModal.tsx','utf8');
    const branch=sepa.slice(sepa.indexOf('    if (isTraining) {'),sepa.indexOf('    // Histórico de exportações'));
    expect(branch).toContain('downloadXml(out.xml, out.fileName)');
    expect(branch).toContain('return;');
    expect(branch).not.toMatch(/insert|onExported|auth/);
    const accounting=readFileSync('src/components/ReportAccountingExport.tsx','utf8');
    expect(accounting).toContain('if (isTraining) return;');
    expect(accounting).toContain('a.download = isTraining ? `TREINO_${fileName}` : fileName');
    expect(accounting).toContain('${isTraining ? "_TREINO" : ""}.csv');
    expect(accounting.indexOf('if (isTraining) {')).toBeLessThan(accounting.indexOf('await registerExport.mutateAsync()'));
  });
});
