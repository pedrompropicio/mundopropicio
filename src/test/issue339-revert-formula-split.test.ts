// @vitest-environment node
// PGlite em memória, dados sintéticos; sem ligação a bases externas.
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const sourcePath = 'supabase/migrations/20260908180025_799cd699-529f-4189-8e19-77009685142f.sql';
const source = readFileSync(sourcePath, 'utf8');
const migrationPath = 'drizzle/migrations/0343_issue339_revert_formula_split.sql';
const migration = readFileSync(migrationPath, 'utf8');
const rollback = readFileSync('supabase/manual/rollback_0343_issue339_revert_formula_split_comentado.sql', 'utf8');
const signature = 'public._revert_event_to_version(uuid,uuid,uuid,text,boolean)';

function definition(sql: string, name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Definição ausente: ${name}`);
  const tail = sql.slice(start);
  const tag = tail.match(/\bAS\s+(\$\w*\$)/i)?.[1];
  if (!tag) throw new Error(`Corpo ausente: ${name}`);
  const end = tail.indexOf(tag, tail.indexOf(tag) + tag.length);
  if (end < 0 || tail[end + tag.length] !== ';') throw new Error(`Fim inválido: ${name}`);
  return tail.slice(0, end + tag.length + 1) + '\n';
}

const oldDefinition = definition(source, '_revert_event_to_version');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MASTER = uuid(1), LISBOA = uuid(2), PORTO = uuid(3), ACTOR = uuid(4), CATEGORY = uuid(5);
let db: PGlite;

// Só as dependências necessárias à função; helpers de vínculos e dispatcher
// Master→Splits são lidos dos ficheiros existentes, sem os reimplementar.
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE ROLE fixture_owner NOLOGIN;
    CREATE TABLE events(id uuid PRIMARY KEY, parent_event_id uuid REFERENCES events);
    CREATE TABLE bp_versions(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events,
      version_number integer NOT NULL, state text NOT NULL, created_by uuid, created_by_label text,
      description text, snapshot_payload jsonb NOT NULL, approved_at timestamptz, approved_by uuid,
      is_retroactive_snapshot boolean DEFAULT false, cascaded_from_version_id uuid REFERENCES bp_versions,
      superseded_at timestamptz, superseded_by_version_id uuid REFERENCES bp_versions,
      scenario_label text, UNIQUE(event_id, version_number)
    );
    CREATE UNIQUE INDEX one_active_per_event ON bp_versions(event_id) WHERE state='active';
    CREATE TABLE event_forecasts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events,
      category_id uuid, type text NOT NULL CHECK(type IN ('income','expense')), description text NOT NULL,
      amount numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'EUR', original_amount numeric,
      fx_rate numeric, fx_rate_source text, formula_type text NOT NULL DEFAULT 'fixed',
      formula_value numeric NOT NULL DEFAULT 0, iva_rate numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'pending', approved_at timestamptz, approved_by uuid,
      transaction_id uuid, cache_config_id uuid, master_forecast_id uuid, invoice_group_id uuid,
      attachment_refs jsonb NOT NULL DEFAULT '[]', historic_overrides jsonb NOT NULL DEFAULT '[]',
      is_overhead boolean NOT NULL DEFAULT false, is_retroactive_override boolean NOT NULL DEFAULT false,
      is_transitory boolean NOT NULL DEFAULT false, exclude_from_result boolean NOT NULL DEFAULT false,
      notes text, specification text, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), version_id uuid REFERENCES bp_versions
    );
    CREATE TABLE transactions(id uuid PRIMARY KEY, forecast_id uuid REFERENCES event_forecasts ON DELETE SET NULL);
    CREATE TABLE bp_version_audit_log(
      version_id uuid REFERENCES bp_versions, event_id uuid REFERENCES events, action text,
      performed_by uuid, performed_by_label text, metadata jsonb
    );
  `);
  // As três colunas omitidas vêm do DDL real, incluindo os CHECK de repartição.
  const formulaDDL = readFileSync('supabase/migrations/20260929200032_4fd3e0ef-9979-4d5a-aa6d-ef5c6432397a.sql', 'utf8');
  await db.exec(formulaDDL.slice(0, formulaDDL.indexOf('\n\n')));
  await db.exec(readFileSync('drizzle/migrations/0238_event_forecasts_revenue_split.sql', 'utf8'));
  for (const name of ['bp_capture_tx_links', 'bp_restore_tx_links', 'bp_version_linked_tx_count']) {
    await db.exec(definition(source, name));
  }
  await db.exec(oldDefinition);
  // Dispatcher original de reversão: a E2b só substitui o helper chamado por ele.
  await db.exec(definition(readFileSync('supabase/migrations/20260426020734_5034aaf2-1255-47b5-aac1-7afefac8d096.sql', 'utf8'), 'revert_to_bp_version'));
}, 60000);
beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK'); });
afterAll(async () => { await db?.close(); });

type Line = Record<string, unknown>;
function line(id: number, event: string, changes: Line = {}): Line {
  return {
    id: uuid(id), event_id: event, category_id: CATEGORY, type: 'income', description: `Linha ${id}`,
    amount: 1200.45, currency: 'EUR', original_amount: 1250.50, fx_rate: 1, fx_rate_source: 'manual',
    formula_type: 'fixed', formula_value: 0, formula_params: null, revenue_split_mode: null,
    revenue_split_params: null, iva_rate: 23, status: 'approved', approved_at: '2026-01-02T00:00:00Z',
    approved_by: ACTOR, transaction_id: null, cache_config_id: null, master_forecast_id: null,
    invoice_group_id: null, attachment_refs: ['synthetic.pdf'], historic_overrides: [],
    is_overhead: false, is_retroactive_override: false, is_transitory: false, exclude_from_result: false,
    notes: 'Nota sintética', specification: 'Especificação sintética',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', version_id: null,
    ...changes,
  };
}

async function seed(event: string, rows1: Line[], rows2: Line[], parent: string | null = null, cascade: string | null = null) {
  await db.query('INSERT INTO events VALUES ($1,$2)', [event, parent]);
  const v1 = uuid(Number(event.slice(-12)) * 100 + 1);
  const v2 = uuid(Number(event.slice(-12)) * 100 + 2);
  await db.query(`INSERT INTO bp_versions(id,event_id,version_number,state,snapshot_payload,cascaded_from_version_id)
    VALUES($1,$2,1,'superseded',$3,$4),($5,$2,2,'active',$6,NULL)`,
  [v1, event, JSON.stringify({ forecasts: rows1 }), cascade, v2, JSON.stringify({ forecasts: rows2 })]);
  await db.query('INSERT INTO event_forecasts SELECT * FROM jsonb_populate_recordset(NULL::event_forecasts,$1::jsonb)', [JSON.stringify(rows2)]);
  return { v1, v2 };
}

async function revert(event: string, version: string, force = false) {
  await db.query(`SELECT public._revert_event_to_version($1,$2,$3,'Executor sintético',$4)`, [event, version, ACTOR, force]);
}
async function lines(event: string) {
  return (await db.query<Line>(`SELECT id, amount, formula_type, formula_value, formula_params,
    revenue_split_mode, revenue_split_params FROM event_forecasts WHERE event_id=$1 ORDER BY id`, [event])).rows;
}
const fields = (row: Line) => Object.fromEntries(['id', 'amount', 'formula_type', 'formula_value',
  'formula_params', 'revenue_split_mode', 'revenue_split_params']
  .map(key => [key, key === 'amount' || key === 'formula_value' ? String(row[key]) : row[key]]));

async function state() {
  const active = (await db.query<{ id: string }>(`SELECT id FROM bp_versions WHERE state='active'`)).rows[0].id;
  const result = (await db.query<{ data: unknown }>(`SELECT jsonb_build_object(
    'forecasts', (SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM event_forecasts f),
    'versions', (SELECT jsonb_agg(to_jsonb(v) ORDER BY version_number) FROM bp_versions v),
    'audit', (SELECT jsonb_agg(to_jsonb(a) ORDER BY action) FROM bp_version_audit_log a),
    'transactions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t)
  ) AS data`)).rows[0].data;
  // Só o UUID da nova versão é aleatório; now() é constante nesta transação.
  return JSON.stringify(result).replaceAll(active, '<nova-versao-ativa>');
}

describe('#339 E2b — reversão de fórmula e repartição', () => {
  it.each(['equal', 'fixed_pct', 'ticket_share'])('v1→v2→v1 repõe valores e todos os campos com repartição %s', async mode => {
    const v1 = line(10, MASTER, { formula_type: 'pct_ticket_revenue', formula_value: 2,
      formula_params: { rate: 2, basis: 'net', zone_ids: [uuid(20)], min: 100, max: 5000 },
      revenue_split_mode: mode, revenue_split_params: mode === 'fixed_pct' ? { [LISBOA]: 35, [PORTO]: 65 } : {} });
    const v2 = line(10, MASTER, { amount: 9876.54, formula_type: 'per_head', formula_value: 3,
      formula_params: { unit_amount: 3, include_courtesies: true, zone_ids: null, min: 0, max: null },
      revenue_split_mode: 'fixed_pct', revenue_split_params: { [LISBOA]: 80, [PORTO]: 20 } });
    const versions = await seed(MASTER, [v1], [v2]);
    expect(await lines(MASTER)).toEqual([fields(v2)]);
    await db.exec(migration);
    await revert(MASTER, versions.v1);
    expect(await lines(MASTER)).toEqual([fields(v1)]);
    await revert(MASTER, versions.v2);
    expect(await lines(MASTER)).toEqual([fields(v2)]);
  });

  it.each(['ausentes', 'null JSON'])('linhas sem fórmula/repartição (%s) mantêm NULL SQL e defaults antigos', async kind => {
    const plain = line(10, MASTER);
    if (kind === 'ausentes') {
      for (const key of ['formula_type', 'formula_value', 'formula_params', 'revenue_split_mode', 'revenue_split_params']) delete plain[key];
    }
    const versions = await seed(MASTER, [plain], [line(10, MASTER, { formula_type: 'per_head',
      formula_value: 5, formula_params: { unit_amount: 5 }, revenue_split_mode: 'equal', revenue_split_params: {} })]);
    await db.exec(migration);
    await revert(MASTER, versions.v1);
    expect(await lines(MASTER)).toEqual([fields(line(10, MASTER))]);
    expect((await db.query(`SELECT formula_params IS NULL AS formula_null,
      revenue_split_mode IS NULL AS mode_null, revenue_split_params IS NULL AS params_null FROM event_forecasts`)).rows)
      .toEqual([{ formula_null: true, mode_null: true, params_null: true }]);
  });

  it('Master→cidades repõe a fórmula e a repartição próprias de cada snapshot', async () => {
    const family = [MASTER, LISBOA, PORTO];
    const targets = family.map((event, i) => line(10 + i, event, { amount: (i + 1) * 100,
      formula_type: 'pct_ticket_revenue', formula_value: i + 1, formula_params: { rate: i + 1, basis: 'net' },
      revenue_split_mode: 'fixed_pct', revenue_split_params: { [LISBOA]: 30 + i, [PORTO]: 70 - i } }));
    const master = await seed(MASTER, [targets[0]], [line(10, MASTER)]);
    for (let i = 1; i < family.length; i++) {
      await seed(family[i], [targets[i]], [line(10 + i, family[i])], MASTER, master.v1);
    }
    await db.exec(migration);
    await db.query('SELECT revert_to_bp_version($1,false,$2,$3)', [master.v1, ACTOR, 'Executor sintético']);
    for (let i = 0; i < family.length; i++) expect(await lines(family[i])).toEqual([fields(targets[i])]);
    expect((await db.query(`SELECT event_id, count(*)::int AS n FROM bp_versions WHERE state='active' GROUP BY event_id ORDER BY event_id`)).rows)
      .toEqual(family.map(event => ({ event_id: event, n: 1 })));
  });

  it('sem fórmula/repartição, a definição antiga e a 0343 produzem o mesmo estado completo na mesma fixture', async () => {
    const plain = line(10, MASTER);
    for (const key of ['formula_type', 'formula_value', 'formula_params', 'revenue_split_mode', 'revenue_split_params']) delete plain[key];
    const versions = await seed(MASTER, [plain, line(11, MASTER, { type: 'expense', is_overhead: true })],
      [line(10, MASTER, { amount: 9000 }), line(11, MASTER, { type: 'expense', amount: 8000 })]);
    await db.query('INSERT INTO transactions VALUES ($1,$2)', [uuid(50), uuid(10)]);
    await db.exec('SAVEPOINT same_fixture');
    await revert(MASTER, versions.v1, true);
    const before = await state();
    await db.exec('ROLLBACK TO SAVEPOINT same_fixture');
    await db.exec(migration);
    await revert(MASTER, versions.v1, true);
    expect(await state()).toBe(before);
    expect((await db.query('SELECT forecast_id FROM transactions')).rows).toEqual([{ forecast_id: uuid(10) }]);
  });

  it('a trava de vínculos continua a recusar sem force e repõe o vínculo com force', async () => {
    const original = line(10, MASTER, { formula_type: 'per_head', formula_value: 2,
      formula_params: { unit_amount: 2 }, revenue_split_mode: 'equal', revenue_split_params: {} });
    const versions = await seed(MASTER, [original], [line(10, MASTER, { amount: 9000 })]);
    await db.query('INSERT INTO transactions VALUES ($1,$2)', [uuid(50), uuid(10)]);
    await db.exec(migration);
    await db.exec('SAVEPOINT blocked');
    await expect(revert(MASTER, versions.v1)).rejects.toThrow('Reversão bloqueada');
    await db.exec('ROLLBACK TO SAVEPOINT blocked');
    expect((await lines(MASTER))[0].amount).toBe('9000');
    await revert(MASTER, versions.v1, true);
    expect(await lines(MASTER)).toEqual([fields(original)]);
    expect((await db.query('SELECT forecast_id FROM transactions')).rows).toEqual([{ forecast_id: uuid(10) }]);
  });

  it('preserva owner, SECURITY, search_path e has_function_privilege antes/depois, mesmo com default privileges diferentes', async () => {
    await db.exec(`ALTER FUNCTION ${signature} OWNER TO fixture_owner;
      REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION ${signature} TO service_role;
      ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`);
    const properties = async () => (await db.query(`SELECT pg_get_userbyid(proowner) AS owner,
      prosecdef, proconfig, proacl::text AS acl,
      has_function_privilege('anon',oid,'EXECUTE') AS anon,
      has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated,
      has_function_privilege('service_role',oid,'EXECUTE') AS service_role
      FROM pg_proc WHERE oid=$1::regprocedure`, [signature])).rows[0];
    const before = await properties();
    expect(before).toMatchObject({ owner: 'fixture_owner', prosecdef: true, proconfig: ['search_path=public'],
      anon: false, authenticated: false, service_role: true });
    await db.exec(migration);
    expect(await properties()).toEqual(before);
  });

  it('as duas 0343 têm bytes e SHA-256/MD5 iguais; rollback só comentado repõe exatamente a origem', async () => {
    const bytes = readFileSync(migrationPath);
    const manual = readFileSync('supabase/manual/0343_issue339_revert_formula_split.sql');
    expect(bytes.equals(manual)).toBe(true);
    for (const algorithm of ['sha256', 'md5']) {
      expect(createHash(algorithm).update(bytes).digest('hex')).toBe(createHash(algorithm).update(manual).digest('hex'));
    }
    expect(rollback.trimEnd().split('\n').every(row => row.startsWith('--'))).toBe(true);
    const uncommented = rollback.split('\n').slice(2).map(row => row.slice(2)).join('\n');
    expect(uncommented).toBe(oldDefinition);
    const original = (await db.query('SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure', [signature])).rows[0];
    await db.exec(migration);
    const prepared = (await db.query('SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure', [signature])).rows[0];
    await db.exec(uncommented);
    const restored = (await db.query('SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure', [signature])).rows[0];
    expect(restored).not.toEqual(prepared);
    expect(restored).toEqual(original);
  });
});
