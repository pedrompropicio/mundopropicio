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
    expect((await db.query<{ n: number }>("select count(*)::int n from data_entry_gmail_connections")).rows[0].n).toBe(1);
    // Rollback sem ligações: limpo.
    await db.exec("delete from data_entry_gmail_connections");
    await db.exec(down);
    expect((await db.query<{ n: number }>("select count(*)::int n from pg_tables where tablename like 'data_entry_gmail%'")).rows[0].n).toBe(0);
    await db.close();
  }, 30000);
});
