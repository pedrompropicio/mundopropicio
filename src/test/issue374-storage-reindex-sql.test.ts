// @vitest-environment node
// Teste de texto: não executa SQL, não usa PGlite, rede ou credenciais.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manualPath = 'supabase/manual/0311_issue374_reindex_storage_idx_objects_bucket_id_name_lower.sql';
const rollbackPath = 'supabase/manual/rollback_0311_issue374_reindex_storage_idx_objects_bucket_id_name_lower_comentado.sql';
const sql = readFileSync(manualPath, 'utf8');
const withoutComments = (text: string) => text.replace(/--[^\n]*/g, '');
const executable = withoutComments(sql);
const reindex = 'REINDEX INDEX CONCURRENTLY storage.idx_objects_bucket_id_name_lower;';
const blocks = sql.split(/^-- Bloco [123] —[^\n]*$/m).slice(1).map(withoutComments);

describe('Issue #374 — preparação manual de REINDEX de storage', () => {
  it('critério 1: contém exactamente uma reconstrução concorrente do índice', () => {
    expect(executable.match(/REINDEX\s+INDEX\s+CONCURRENTLY\s+storage\.idx_objects_bucket_id_name_lower\s*;/gi)).toHaveLength(1);
    expect(executable).toContain(reindex);
    expect(executable).not.toMatch(/\bREINDEX\s+TABLE\b/i);
  });

  it('critério 2: impede transacções e DDL alternativo executável', () => {
    expect(executable).not.toMatch(/\b(?:BEGIN|COMMIT|ROLLBACK)\b|\bSTART\s+TRANSACTION\b|\bDO\s+\$\$|\b(?:DROP|CREATE)\s+INDEX\b/i);
    expect(sql).toContain('PREPARADA, NÃO APLICADA');
    expect(sql).toContain('não corre em transacção');
    expect(sql).toContain('Aplicar só pelo PROC-promocao com Sim');
    expect(blocks).toHaveLength(3);
    expect(blocks[1].trim()).toBe(reindex);
    for (const block of [blocks[0], blocks[2]]) {
      const statements = block.split(';').map((statement) => statement.trim()).filter(Boolean);
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) expect(statement).toMatch(/^SELECT\b/i);
    }
  });

  it('critério 3: pré-verifica MAINTAIN, versão, owner, estado e resíduos', () => {
    expect(blocks[0]).toContain("current_setting('server_version_num')::int AS versao");
    expect(blocks[0]).toContain('pg_get_userbyid(c.relowner) AS owner');
    expect(blocks[0]).toContain("has_table_privilege('storage.objects','MAINTAIN') AS pode_reindex");
    expect(blocks[0]).toContain("c.oid = 'storage.objects'::regclass");
    expect(blocks[0]).toMatch(/SELECT\s+indisvalid,\s*indisready,\s*pg_size_pretty\(pg_relation_size\(indexrelid\)\)/i);
    expect(blocks[0]).toContain("indexrelid = 'storage.idx_objects_bucket_id_name_lower'::regclass");
    expect(blocks[0]).toContain("n.nspname = 'storage'");
    expect(blocks[0]).toContain("c.relname LIKE 'idx_objects_bucket_id_name_lower_cc%'");
    expect(sql).toContain('pode_reindex = false ⇒ parar');
  });

  it('critério 3: verifica validade, prontidão e zero resíduos no schema storage', () => {
    expect(blocks[2]).toMatch(/SELECT\s+indisvalid,\s*indisready\s+FROM\s+pg_index\s+WHERE\s+indexrelid = 'storage\.idx_objects_bucket_id_name_lower'::regclass;/i);
    expect(blocks[2]).toContain('SELECT count(*) AS residuos');
    expect(blocks[2]).toContain("n.nspname = 'storage'");
    expect(blocks[2]).toContain("c.relname LIKE 'idx_objects_bucket_id_name_lower_cc%'");
    expect(sql).toContain('indisvalid = true e indisready = true');
    expect(sql).toContain('residuos = 0');
  });

  it('critérios 1–3: documenta a origem e mantém a alternativa só em comentário', () => {
    expect(sql).toContain('Supabase (storage-api)');
    for (const source of ['phase2h-catalog-ddl.json', 'phase2h-differential.json', 'phase2h-live-capture.json']) {
      expect(sql).toContain(source);
    }
    expect(sql).toContain('postgres=a*r*w*d*D*x*t*m*/supabase_storage_admin');
    expect(sql).toContain('a causa operacional da invalidação não foi investigada');
    expect(sql).toContain('-- DROP INDEX CONCURRENTLY storage.idx_objects_bucket_id_name_lower;');
    expect(sql).toContain('-- CREATE INDEX CONCURRENTLY idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");');
    expect(sql).toContain(rollbackPath);
  });

  it('critério 4: fica fora de drizzle e mantém o rollback integralmente comentado', () => {
    expect(readdirSync('drizzle/migrations').filter((name) => name.startsWith('0311_'))).toEqual([]);
    const rollback = readFileSync(rollbackPath, 'utf8');
    expect(rollback.split('\n').every((line) => !line || line.startsWith('--'))).toBe(true);
    expect(withoutComments(rollback).trim()).toBe('');
    expect(rollback).toContain('não tem reversão funcional');
    expect(rollback).toContain('supabase_storage_admin');
    expect(rollback).toContain('-- DROP INDEX CONCURRENTLY storage.idx_objects_bucket_id_name_lower_ccnew;');
  });
});
