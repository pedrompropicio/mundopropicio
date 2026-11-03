// @vitest-environment node
// Só PGlite em memória, dados sintéticos e captura local da fila; sem rede/credenciais.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migrationPath = 'drizzle/migrations/0306_issue394_eb_open_alert_base_url.sql';
const manualPath = 'supabase/manual/0306_issue394_eb_open_alert_base_url.sql';
const rollbackPath = 'supabase/manual/rollback_0306_issue394_eb_open_alert_base_url_comentado.sql';
const original = readFileSync('drizzle/migrations/0292_issue359_eb_open_authorisations_link.sql', 'utf8');
const migration = readFileSync(migrationPath, 'utf8');
const company = '7d831e59-6e82-427b-95a0-64904aae5dd2';
const missingBaseMessage = 'project_functions_base_url esta vazio em app_secrets.';
let db: PGlite;

const send = () => db.query<{ result: { dry_run: boolean; queued: number } }>(
  'SELECT public.coala_send_eb_open_alert(10, false, NULL) AS result',
);
const effects = async () => (await db.query(`
  SELECT (SELECT count(*)::int FROM captured_emails) AS emails,
         (SELECT count(*)::int FROM token_calls) AS tokens,
         (SELECT count(*)::int FROM coala_send_runs) AS runs
`)).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE portal_settings(company_id uuid, key text, value jsonb);
    CREATE TABLE app_secrets(name text PRIMARY KEY, value text);
    CREATE TABLE email_send_log(message_id text, status text, created_at timestamptz DEFAULT now());
    CREATE TABLE coala_invites(company_id uuid, email text, status text, locale text);
    CREATE TABLE lead_capture(company_id uuid, email text, raw jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE suppressed_emails(company_id uuid, email text);
    CREATE TABLE email_unsubscribe_tokens(company_id uuid, email text, used_at timestamptz);
    -- Relação sintética com a forma da fonte canónica do loop da 0292.
    CREATE TABLE coala_list_members(email text PRIMARY KEY);
    CREATE TABLE coala_send_runs(
      company_id uuid, function_name text, daily_cap int, queued int, details jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE captured_emails(queue text, payload jsonb);
    CREATE TABLE token_calls(email text);
    CREATE FUNCTION public.coala_unsub_token(p_email text) RETURNS text
      LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO token_calls VALUES (p_email);
        RETURN 'synthetic-token';
      END $$;
    CREATE FUNCTION public.enqueue_email(p_queue text, p_payload jsonb) RETURNS void
      LANGUAGE sql AS $$ INSERT INTO captured_emails VALUES (p_queue, p_payload); $$;
    -- ACL prévia sintética: a substituição deve preservá-la sem novos grants.
    CREATE FUNCTION public.coala_send_eb_open_alert(
      p_daily_cap integer DEFAULT NULL::integer, p_dry_run boolean DEFAULT true,
      p_only_emails text[] DEFAULT NULL::text[]
    ) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
      AS $$ SELECT '{}'::jsonb; $$;
    REVOKE ALL ON FUNCTION public.coala_send_eb_open_alert(integer, boolean, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.coala_send_eb_open_alert(integer, boolean, text[]) TO service_role;
  `);
  // Carrega apenas o accessor canónico e as suas revogações; exclui o seed de ambiente.
  const accessorSource = readFileSync(
    'supabase/migrations/20260820135937_cd9ae973-08cf-4884-a1d2-4dd9f477baf4.sql', 'utf8',
  );
  await db.exec(accessorSource.slice(
    accessorSource.indexOf('CREATE OR REPLACE FUNCTION public.vip_coupon_functions_base_url()'),
    accessorSource.indexOf('INSERT INTO public.app_secrets'),
  ));
  await db.exec(migration);
}, 30_000);

beforeEach(async () => {
  await db.exec(`
    TRUNCATE portal_settings, app_secrets, email_send_log, coala_invites, lead_capture,
      suppressed_emails, email_unsubscribe_tokens, coala_list_members, coala_send_runs,
      captured_emails, token_calls;
    INSERT INTO portal_settings VALUES ('${company}', 'early_bird.fever_url', '"https://tickets.test"');
    INSERT INTO app_secrets VALUES ('project_functions_base_url', 'https://x');
    INSERT INTO coala_list_members VALUES ('pt@example.test'), ('en@example.test');
    INSERT INTO coala_invites VALUES ('${company}', 'en@example.test', 'confirmed', 'en');
  `);
});

afterAll(async () => { await db?.close(); });

describe('Issue #394 — alerta Early Bird com base URL configurada', () => {
  it.each(['https://x', 'https://x/'])('compõe o link HTTP em PT/EN com base %s', async (base) => {
    await db.query('UPDATE app_secrets SET value = $1', [base]);
    expect((await send()).rows[0].result).toMatchObject({ dry_run: false, queued: 2 });
    const { rows } = await db.query<{ queue: string; payload: Record<string, string> }>(
      'SELECT queue, payload FROM captured_emails ORDER BY payload->>\'to\'',
    );
    expect(rows).toHaveLength(2);
    expect(rows.map(({ payload }) => payload.to)).toEqual(['en@example.test', 'pt@example.test']);
    for (const { queue, payload } of rows) {
      expect(queue).toBe('transactional_emails');
      expect(payload.unsubscribe_http_url).toBe(
        'https://x/functions/v1/handle-email-unsubscribe?token=' + payload.unsubscribe_token,
      );
      expect(payload.unsubscribe_token).toBe('synthetic-token');
    }
    expect(await effects()).toEqual({ emails: 2, tokens: 2, runs: 1 });
  });

  it.each(['ausente', 'nula', 'vazia'] as const)('recusa a chave %s antes de gerar tokens ou enfileirar', async (state) => {
    if (state === 'ausente') await db.exec('DELETE FROM app_secrets');
    else await db.query('UPDATE app_secrets SET value = $1', [state === 'nula' ? null : '']);
    await expect(send()).rejects.toThrow(missingBaseMessage);
    expect(await effects()).toEqual({ emails: 0, tokens: 0, runs: 0 });
  });

  it('mantém o dry run sem configuração e sem efeitos de envio', async () => {
    await db.exec('DELETE FROM app_secrets');
    const { rows } = await db.query<{ result: { dry_run: boolean; contagens: { a_enviar: number } } }>(
      'SELECT public.coala_send_eb_open_alert() AS result',
    );
    expect(rows[0].result.dry_run).toBe(true);
    expect(rows[0].result.contagens.a_enviar).toBe(2);
    expect(await effects()).toEqual({ emails: 0, tokens: 0, runs: 0 });
  });

  it('mantém a guarda anterior de fever_url', async () => {
    await db.exec('DELETE FROM portal_settings; DELETE FROM app_secrets');
    await expect(send()).rejects.toThrow('early_bird.fever_url esta vazio em portal_settings (empresa Coala).');
    expect(await effects()).toEqual({ emails: 0, tokens: 0, runs: 0 });
  });

  it('preserva SECURITY DEFINER, search_path e ACL existente', async () => {
    const { rows } = await db.query(`
      SELECT prosecdef, proconfig,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated,
        has_function_privilege('service_role', oid, 'EXECUTE') AS service_role
      FROM pg_proc WHERE oid = 'public.coala_send_eb_open_alert(integer,boolean,text[])'::regprocedure
    `);
    expect(rows).toEqual([{
      prosecdef: true, proconfig: ['search_path=public'], anon: false,
      authenticated: false, service_role: true,
    }]);
  });

  it('limita a alteração da 0292 à declaração, guarda e composição do link', () => {
    const body = (sql: string) => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
    const expected = body(original)
      .replace('  v_fever text;\n', '  v_fever text;\n  v_base text;\n')
      .replace('  for r in select e, loc, reenvio, n_reenvios from _alert\n',
        "  v_base := public.vip_coupon_functions_base_url();\n" +
        "  if v_base is null or v_base = '' then\n" +
        `    raise exception '${missingBaseMessage}';\n` +
        '  end if;\n\n  for r in select e, loc, reenvio, n_reenvios from _alert\n')
      .replace(/    v_unsub_http := '[^'\n]+' \|\| v_unsub_token;/,
        "    v_unsub_http := rtrim(v_base, '/') || '/functions/v1/handle-email-unsubscribe?token=' || v_unsub_token;");
    expect(body(migration) === expected).toBe(true);
  });

  it('mantém drizzle/manual byte a byte iguais e os três SQL sem domínio de projeto', () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    for (const path of [migrationPath, manualPath, rollbackPath]) {
      expect(readFileSync(path, 'utf8')).not.toContain('supabase.co');
    }
  });

  it('mantém o rollback integralmente comentado e fiel à 0292 com marcador do host', () => {
    const rollback = readFileSync(rollbackPath, 'utf8');
    expect(rollback.split('\n').every((line) => line === '' || line === '--' || line.startsWith('-- '))).toBe(true);
    const restored = rollback.slice(rollback.indexOf('-- CREATE OR REPLACE FUNCTION'))
      .split('\n').map((line) => line === '--' ? '' : line.startsWith('-- ') ? line.slice(3) : line).join('\n');
    const sanitized = original.slice(original.indexOf('CREATE OR REPLACE FUNCTION'))
      .replace(/https:\/\/[^/\s'"]+\.supabase\.co/g, 'https://<host Live>');
    expect(restored === sanitized).toBe(true);
    expect(restored).toContain('<host Live>');
  });
});
