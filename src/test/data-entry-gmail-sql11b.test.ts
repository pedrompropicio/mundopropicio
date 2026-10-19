// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const up = fs.readFileSync("supabase/manual/20261019_issue333_gmail_connections.INERTE.sql", "utf8");
const down = fs.readFileSync("supabase/manual/20261019_issue333_gmail_connections.ROLLBACK-INERTE.sql", "utf8");
describe("#333 fase11b SQL inerte (PGlite local)", () => {
  it("só service_role tem acesso; browser nenhum; vínculos curtos; rollback limpo", async () => {
    const db = new PGlite();
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(up);
    const acl = await db.query<{ grantee: string }>("select distinct grantee from information_schema.role_table_grants where table_name like 'data_entry_gmail%' and grantee in ('anon','authenticated','PUBLIC','service_role')");
    expect(acl.rows.map((r) => r.grantee)).toEqual(["service_role"]);
    await expect(db.exec("insert into data_entry_gmail_pending(user_id,company_id,nonce_sha256,expires_at) values (gen_random_uuid(),gen_random_uuid(),repeat('a',64),now()+interval '1 day')")).rejects.toBeTruthy();
    await expect(db.exec("insert into data_entry_gmail_connections(user_id,company_id,connection_key_ciphertext) values (gen_random_uuid(),gen_random_uuid(),'curta')")).rejects.toBeTruthy();
    await db.exec(down);
    expect((await db.query<{ n: number }>("select count(*)::int n from pg_tables where tablename like 'data_entry_gmail%'")).rows[0].n).toBe(0);
    await db.close();
  }, 30000);
});
