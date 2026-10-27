// @vitest-environment node
// #359 / D-ERP312 — WhatsApp Coala form_legacy_sem_prova fica inelegível; MP e decisões explícitas inalteradas.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

const COALA = '7d831e59-6e82-427b-95a0-64904aae5dd2';
const MP = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
const PHONE = '+351912345678';
let db: PGlite;
let n = 0;

async function contact(company: string, source: string | null): Promise<string> {
  n += 1;
  const id = `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  await db.query(
    'INSERT INTO public.contacts(id,company_id,phone_e164,consent_whatsapp,consent_whatsapp_source) VALUES($1,$2,$3,true,$4)',
    [id, company, PHONE, source],
  );
  return id;
}
async function eligible(id: string): Promise<boolean> {
  return (await db.query<{ ok: boolean }>('SELECT public.crm_whatsapp_eligible($1::uuid) ok', [id])).rows[0].ok;
}
async function decide(id: string, decision: string) {
  await db.query('INSERT INTO public.wa_latest(contact_id,decision,phone,phone_fp) VALUES($1,$2,$3,$4)', [
    id, decision, PHONE, 'fp:' + PHONE,
  ]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
  CREATE FUNCTION public.row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE FUNCTION public._club332_whatsapp_fp(text) RETURNS text LANGUAGE sql AS $$ SELECT 'fp:'||$1 $$;
  CREATE TABLE public.contacts(id uuid PRIMARY KEY, company_id uuid, phone_e164 text, consent_whatsapp boolean, consent_whatsapp_source text);
  CREATE TABLE public.wa_latest(contact_id uuid, decision text, phone text, phone_fp text);
  CREATE FUNCTION public._crm_whatsapp_latest(p_contact uuid, p_company uuid)
   RETURNS TABLE(decision text, phone text, phone_fp text) LANGUAGE sql STABLE
   AS $$ SELECT decision, phone, phone_fp FROM public.wa_latest WHERE contact_id=p_contact $$;`);
  await db.exec(readFileSync('supabase/manual/0276_issue359_whatsapp_coala_legacy.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });

describe('0276 crm_whatsapp_eligible — Coala legado sem prova', () => {
  it('(1) Coala form_legacy_sem_prova sem decisão → false', async () => {
    expect(await eligible(await contact(COALA, 'form_legacy_sem_prova'))).toBe(false);
  });
  it('(2) MP form_legacy_sem_prova sem decisão → true como antes', async () => {
    expect(await eligible(await contact(MP, 'form_legacy_sem_prova'))).toBe(true);
  });
  it('(3) Coala com outra origem segue a regra atual', async () => {
    expect(await eligible(await contact(COALA, 'coala-form-2026-10-v1'))).toBe(true);
    expect(await eligible(await contact(COALA, null))).toBe(true);
    expect(await eligible(await contact(COALA, 'club_profile_whatsapp-v2'))).toBe(false);
  });
  it('(4) decisão granted prevalece para Coala legado; revogação prevalece', async () => {
    const g = await contact(COALA, 'form_legacy_sem_prova');
    await decide(g, 'granted');
    expect(await eligible(g)).toBe(true);
    const r = await contact(COALA, 'form_legacy_sem_prova');
    await decide(r, 'revoked');
    expect(await eligible(r)).toBe(false);
    const m = await contact(MP, 'form_legacy_sem_prova');
    await decide(m, 'revoked');
    expect(await eligible(m)).toBe(false);
  });
  it('mantém atributos: plpgsql, STABLE, SECURITY DEFINER, search_path', async () => {
    const sql = readFileSync('supabase/manual/0276_issue359_whatsapp_coala_legacy.sql', 'utf8');
    expect(sql).toContain('LANGUAGE plpgsql');
    expect(sql).toContain('STABLE SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(sql).not.toMatch(/GRANT|REVOKE|_crm_whatsapp_project|_crm_whatsapp_contact_guard/);
  });
});
