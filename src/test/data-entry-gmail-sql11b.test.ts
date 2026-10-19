// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const up = fs.readFileSync("supabase/manual/20261019_issue333_gmail_connections.INERTE.sql", "utf8");
const down = fs.readFileSync("supabase/manual/20261019_issue333_gmail_connections.ROLLBACK-INERTE.sql", "utf8");
describe("#333 fase11b/11c SQL inerte (PGlite local)", () => {
  it("só service_role tem acesso; browser e roles técnicas nenhum; vínculos curtos; idempotente; rollback protege ligações", async () => {
    const db = new PGlite();
    await db.exec("create role anon; create role authenticated; create role service_role; create role authenticator;");
    await db.exec(up);
    // Idempotência: re-executar o pacote não falha nem duplica.
    await db.exec(up);
    const acl = await db.query<{ grantee: string }>("select distinct grantee from information_schema.role_table_grants where table_name like 'data_entry_gmail%' and grantee in ('anon','authenticated','authenticator','PUBLIC','service_role')");
    expect(acl.rows.map((r) => r.grantee)).toEqual(["service_role"]);
    // Vínculo pendente: TTL máximo 15 min.
    await expect(db.exec("insert into data_entry_gmail_pending(user_id,company_id,nonce_sha256,expires_at) values (gen_random_uuid(),gen_random_uuid(),repeat('a',64),now()+interval '1 day')")).rejects.toBeTruthy();
    // Chave cifrada: tamanho mínimo obrigatório.
    await expect(db.exec("insert into data_entry_gmail_connections(user_id,company_id,connection_key_ciphertext) values (gen_random_uuid(),gen_random_uuid(),'curta')")).rejects.toBeTruthy();
    // Rollback com ligação existente: RECUSADO (não apaga ligações).
    await db.exec("insert into data_entry_gmail_connections(user_id,company_id,connection_key_ciphertext) values (gen_random_uuid(),gen_random_uuid(),repeat('b',64))");
    await expect(db.exec(down)).rejects.toBeTruthy();
    await db.exec("rollback").catch(() => {}); // limpa estado de transação abortada no PGlite
    expect((await db.query<{ n: number }>("select count(*)::int n from data_entry_gmail_connections")).rows[0].n).toBe(1);
    // Rollback sem ligações: limpo.
    await db.exec("delete from data_entry_gmail_connections");
    await db.exec(down);
    expect((await db.query<{ n: number }>("select count(*)::int n from pg_tables where tablename like 'data_entry_gmail%'")).rows[0].n).toBe(0);
    await db.close();
  }, 30000);

  it("fase11d: privilégios por defeito de roles técnicas são revogados só nestas tabelas; guarda deteta grant extra", async () => {
    const db = new PGlite();
    await db.exec("create role anon; create role authenticated; create role service_role; create role authenticator; create role sandbox_exec; create role sandbox_exec_x;");
    await db.exec("alter default privileges in schema public grant select, insert on tables to sandbox_exec, sandbox_exec_x;");
    await db.exec("create table public.outra_legada(id int);");
    await db.exec(up);
    const extra = await db.query<{ t: string; g: string }>("select c.relname t, x.grantee::regrole::text g from pg_class c cross join lateral aclexplode(c.relacl) x where c.relname like 'data_entry_gmail%' and x.grantee <> c.relowner and x.grantee <> 'service_role'::regrole");
    expect(extra.rows).toEqual([]);
    // ACL legada de outra tabela e default privileges globais intactos.
    const legacy = await db.query<{ n: number }>("select count(*)::int n from information_schema.role_table_grants where table_name='outra_legada' and grantee in ('sandbox_exec','sandbox_exec_x')");
    expect(legacy.rows[0].n).toBeGreaterThan(0);
    const defaults = await db.query<{ n: number }>("select count(*)::int n from pg_default_acl");
    expect(defaults.rows[0].n).toBe(1);
    // Guarda: um grant extra de coluna reintroduzido depois falha a re-execução da guarda.
    await db.exec("grant select (user_id) on public.data_entry_gmail_connections to anon;");
    const guard = up.slice(up.lastIndexOf("DO $$"), up.lastIndexOf("COMMIT;"));
    await expect(db.exec(guard)).rejects.toThrow(/ACL inesperada/);
    await db.close();
  }, 30000);
});
