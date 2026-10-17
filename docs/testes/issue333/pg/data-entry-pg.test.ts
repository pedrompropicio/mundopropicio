/**
 * #333 — PostgreSQL 17 real, descartável, com pgcrypto real e DUAS ligações independentes.
 * Sem rede: o servidor escuta só num socket Unix em /tmp. Nunca toca Live.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import postgres from "postgres";

import { createHandler, type Deps } from "../../../../supabase/functions/data-entry/handler";
import { pdfFixture } from "../../../../src/test/fixtures/documents333";
import { persistInvoice, findStrongCandidates, type Store } from "../../../../patches/issue333/compat";
import type { Candidate, Expected } from "../../../../patches/issue333/identity";
vi.stubGlobal("fetch", () => { throw new Error("egress prohibited"); });

const DIR = mkdtempSync("/tmp/pg333-");
const DATA = path.join(DIR, "data");
const PORT = 55433;
let admin: postgres.Sql, c1: postgres.Sql, c2: postgres.Sql;
const connect = () => postgres({ host: DIR, port: PORT, user: "postgres", database: "postgres", max: 1, onnotice: () => {} });
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const A = randomUUID(), B = randomUUID();
const U = { M: randomUUID(), MB: randomUUID(), E: randomUUID(), PA: randomUUID(), Z: randomUUID(), P: randomUUID(), Q: randomUUID() };

type Tx = postgres.TransactionSql;
async function as<T>(sql: postgres.Sql, uid: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}
const rpc = async (sql: postgres.Sql, uid: string, q: (tx: Tx) => postgres.PendingQuery<postgres.Row[]>) =>
  (await as(sql, uid, async (tx) => {
    const row = (await q(tx))[0]; if (!row) throw new Error("Missing SQL fixture row"); return row;
  }));
async function receipt(bucket: string, p: string, h: string, size: number, mime: string) {
  await admin.begin(async (tx) => { await tx`set local role service_role`; await tx`select public.data_entry_record_receipt(${bucket},${p},${h},${size},${mime})`; });
}
async function newSessionWithDoc(uid: string, company: string, bytes: string) {
  const s = (await rpc(c1, uid, (tx) => tx`select public.data_entry_session(null,null) j`)).j;
  const h = sha(bytes); const sid = s.session.id;
  await receipt("data-entry-staging", `${company}/${sid}/${h}`, h, bytes.length, "application/pdf");
  const doc = (await rpc(c1, uid, (tx) => tx`select public.data_entry_add_document(${sid},'f.pdf',${h},${bytes.length},'application/pdf') j`)).j;
  return { sid, docId: doc.id as string, h, size: bytes.length };
}
const fields = (over: Record<string, unknown> = {}) => ({
  supplier_name: "Fornecedor Fictício", supplier_nif: "PT500111222", invoice_number: "FT 2026/1", invoice_date: "2026-10-17",
  currency: "EUR", total_amount: 123, iva_amount: 23, customer_nif: "PT 500 000 001", paid_by_partner_id: U.P, notes: "", ...over,
});
async function prepared(uid: string, company: string, bytes: string, f = fields()) {
  const d = await newSessionWithDoc(uid, company, bytes);
  const p = (await rpc(c1, uid, (tx) => tx`select public.data_entry_prepare(${d.sid},${d.docId},${tx.json(f)}) j`)).j;
  await receipt("standalone-invoices", `${company}/assistant333/${d.docId}/${d.h}.pdf`, d.h, d.size, "application/pdf");
  return { ...d, preview: p };
}
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as { code: string; message: string }; } };
const pending = async (p: Promise<unknown>, ms = 400) => Promise.race([p.then(() => false, () => false), new Promise((r) => setTimeout(() => r(true), ms))]);

// PostgreSQL recusa correr como root: no sandbox usa-se o utilizador temporário pg333 (uid 65534).
const asPg = (cmd: string, args: string[]) => process.getuid?.() === 0
  ? execFileSync("setpriv", ["--reuid=65534", "--regid=65534", "--clear-groups", cmd, ...args], { stdio: "pipe" })
  : execFileSync(cmd, args, { stdio: "pipe" });
beforeAll(async () => {
  if (process.getuid?.() === 0) {
    if (!readFileSync("/etc/passwd", "utf8").includes("pg333:")) throw new Error("BLOQUEIO: falta o utilizador local pg333 (uid 65534) para correr PostgreSQL sem root");
    execFileSync("chown", ["65534:65534", DIR]);
  }
  asPg("initdb", ["-D", DATA, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale"]);
  asPg("pg_ctl", ["-D", DATA, "-w", "-l", path.join(DIR, "log"), "-o", `-k ${DIR} -p ${PORT} -c listen_addresses=''`, "start"]);
  admin = connect(); c1 = connect(); c2 = connect();
  await admin.unsafe(readFileSync("docs/testes/issue333/pg/fixture.sql", "utf8"));
  await admin.unsafe(readFileSync("supabase/manual/20261017_issue333_core.PENDENTE.sql", "utf8"));
  await admin`insert into companies values (${A},'Empresa A','PT500000001','active'),(${B},'Empresa B','PT500000002','active')`;
  for (const id of Object.values(U)) await admin`insert into auth.users values (${id})`;
  const prof = [[U.M,"Gestora M",A,A],[U.MB,"Dupla MB",A,B],[U.E,"Editor E",A,A],[U.PA,"Plataforma PA",null,B],[U.Z,"Gestor Z",A,B],[U.P,"Pagadora P",A,A],[U.Q,"Membro Q",B,B]];
  for (const [id,n,c,ac] of prof) await admin`insert into profiles values (${id},${n},${c},${ac})`;
  const roles: [string,string|null,string][] = [[U.M,A,"manager"],[U.MB,A,"manager"],[U.MB,B,"viewer"],[U.E,A,"editor"],[U.PA,null,"platform_admin"],[U.Z,A,"manager"],[U.P,A,"partner"],[U.Q,B,"partner"]];
  for (const [u,c,r] of roles) await admin`insert into user_roles(user_id,company_id,role) values (${u},${c},${r})`;
  await admin`insert into data_entry_settings values (true,true)`;
  // Injected failure point AFTER the invoice insert and BEFORE the audit row.
  await admin.unsafe(`create function public.t_fail() returns trigger language plpgsql as $$ begin if current_setting('test.fail_audit',true)='on' then raise exception 'injected'; end if; return new; end $$;
    create trigger t_fail before insert on public.data_entry_results for each row execute function public.t_fail();`);
}, 60000);
afterAll(async () => {
  await Promise.all([admin?.end(), c1?.end(), c2?.end()]);
  try { asPg("pg_ctl", ["-D", DATA, "-m", "immediate", "stop"]); } catch { /* already stopped */ }
});

describe("#333 identidade canónica (current_company_id + _effective_permissions_for)", () => {
  it("papel de outra empresa não vale: manager em A, viewer em B activa → recusado", async () => {
    expect((await err(rpc(c1, U.MB, (tx) => tx`select public.data_entry_session() j`)))?.code).toBe("42501");
  });
  it("active_company sem membership cai para a empresa canónica (A) e aí é manager", async () => {
    const s = (await rpc(c1, U.Z, (tx) => tx`select public.data_entry_session() j`)).j;
    expect(s.company.id).toBe(A);
  });
  it("editor (permitido na avulsa legada) é recusado pelo #333; platform_admin aceite na empresa activa", async () => {
    expect((await err(rpc(c1, U.E, (tx) => tx`select public.data_entry_session() j`)))?.code).toBe("42501");
    expect((await rpc(c1, U.PA, (tx) => tx`select public.data_entry_session() j`)).j.company.id).toBe(B);
  });
  it("lote de outro utilizador é inacessível", async () => {
    const s = (await rpc(c1, U.M, (tx) => tx`select public.data_entry_session() j`)).j;
    expect((await err(rpc(c1, U.Z, (tx) => tx`select public.data_entry_session(${s.session.id}) j`)))?.code).toBe("42501");
  });
});

describe("#333 grants e ACL", () => {
  it("anon sem nada; authenticated só RPC de sessão; receipt só service_role; tabelas fechadas", async () => {
    const fns = ["data_entry_session(uuid,uuid)","data_entry_add_document(uuid,text,text,integer,text)","data_entry_note(uuid,text)","data_entry_prepare(uuid,uuid,jsonb)","data_entry_commit(uuid,text)","data_entry_result_check(uuid)"];
    for (const f of fns) {
      const [r] = await admin`select has_function_privilege('anon',${"public."+f},'EXECUTE') a, has_function_privilege('authenticated',${"public."+f},'EXECUTE') u`;
      expect([f, r.a, r.u]).toEqual([f, false, true]);
    }
    const [r] = await admin`select has_function_privilege('authenticated','public.data_entry_record_receipt(text,text,text,integer,text)','EXECUTE') a,
      has_function_privilege('service_role','public.data_entry_record_receipt(text,text,text,integer,text)','EXECUTE') s,
      has_function_privilege('authenticated','public.data_entry_actor()','EXECUTE') act,
      has_table_privilege('authenticated','public.data_entry_results','SELECT') t, has_table_privilege('anon','public.data_entry_previews','SELECT') t2`;
    expect(r).toEqual({ a: false, s: true, act: false, t: false, t2: false });
    expect((await err(as(c1, U.M, (tx) => tx`select * from public.data_entry_sessions`)))?.code).toBe("42501");
  });
});

describe("#333 validação na fronteira SQL", () => {
  it("recusa campo extra, valor em texto, moeda não-EUR, dia inexistente, 3 casas, pagador de outra empresa, NIF do destinatário errado", async () => {
    const d = await newSessionWithDoc(U.M, A, "%PDF-val-" + randomUUID());
    const bad = [fields({ extra: 1 }), fields({ total_amount: "123" }), fields({ currency: "USD" }), fields({ invoice_date: "2026-02-29" }),
      fields({ total_amount: 1.234 }), fields({ paid_by_partner_id: U.Q }), fields({ customer_nif: "PT500000002" }), fields({ iva_amount: 500 })];
    for (const f of bad) expect((await err(rpc(c1, U.M, (tx) => tx`select public.data_entry_prepare(${d.sid},${d.docId},${tx.json(f)})`)))?.message).toMatch(/^#333: /);
  });
  it("documento sem recibo de armazenamento conferido não entra", async () => {
    const s = (await rpc(c1, U.M, (tx) => tx`select public.data_entry_session() j`)).j;
    expect((await err(rpc(c1, U.M, (tx) => tx`select public.data_entry_add_document(${s.session.id},'x.pdf',${sha("x")},1,'application/pdf')`)))?.code).toBe("42501");
  });
  it("o mesmo ficheiro no mesmo lote é reutilizado, não duplicado", async () => {
    const d = await newSessionWithDoc(U.M, A, "%PDF-dup-" + randomUUID());
    const again = (await rpc(c1, U.M, (tx) => tx`select public.data_entry_add_document(${d.sid},'f.pdf',${d.h},${d.size},'application/pdf') j`)).j;
    expect(again).toEqual({ id: d.docId, reused: true });
  });
  it("snapshot_hash é SHA-256 real (pgcrypto) do snapshot", async () => {
    const p = await prepared(U.M, A, "%PDF-hash-" + randomUUID(), fields({ invoice_number: "H-" + randomUUID() }));
    const [r] = await admin`select snapshot::text t, snapshot_hash h from data_entry_previews where id=${p.preview.id}`;
    expect(r.h).toBe(sha(Buffer.from(r.t, "utf8")));
  });
});

describe("#333 execução, autorização e conferência", () => {
  it("execução fechada sem configuração validada", async () => {
    const p = await prepared(U.M, A, "%PDF-gate-" + randomUUID(), fields({ invoice_number: "G-" + randomUUID() }));
    await admin`update data_entry_settings set execute_validated=false`;
    try { expect((await err(rpc(c1, U.M, (tx) => tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash})`)))?.message).toMatch(/não validada/); }
    finally { await admin`update data_entry_settings set execute_validated=true`; }
  });
  it("hash diferente ou prévia antiga invalida a autorização", async () => {
    const f = fields({ invoice_number: "S-" + randomUUID() });
    const p = await prepared(U.M, A, "%PDF-stale-" + randomUUID(), f);
    expect((await err(rpc(c1, U.M, (tx) => tx`select public.data_entry_commit(${p.preview.id},${"0".repeat(64)})`)))?.code).toBe("40001");
    await rpc(c1, U.M, (tx) => tx`select public.data_entry_prepare(${p.sid},${p.docId},${tx.json({ ...f, notes: "v2" })})`);
    expect((await err(rpc(c1, U.M, (tx) => tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash})`)))?.code).toBe("40001");
  });
  it("sem recibo do arquivo final não grava", async () => {
    const d = await newSessionWithDoc(U.M, A, "%PDF-nofinal-" + randomUUID());
    const p = (await rpc(c1, U.M, (tx) => tx`select public.data_entry_prepare(${d.sid},${d.docId},${tx.json(fields({ invoice_number: "N-" + randomUUID() }))}) j`)).j;
    expect((await err(rpc(c1, U.M, (tx) => tx`select public.data_entry_commit(${p.id},${p.snapshot_hash})`)))?.message).toMatch(/Arquivo final/);
  });
  it("grava 1 avulsa com observação do utilizador autenticado e a conferência compara o persistido", async () => {
    const num = "OK-" + randomUUID();
    const p = await prepared(U.M, A, "%PDF-ok-" + randomUUID(), fields({ invoice_number: num }));
    const out = (await rpc(c1, U.M, (tx) => tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash}) j`)).j;
    expect(out.observation).toMatch(/^Feito por LLM com autorização de Gestora M em \d{2}\/\d{2}\/\d{4}\.$/);
    const [inv] = await admin`select * from standalone_invoices where id=${out.invoice_id}`;
    expect([inv.company_id, inv.created_by, inv.invoice_number, String(inv.total_amount), inv.status]).toEqual([A, U.M, num, "123", "new"]);
    expect(inv.invoice_date.toISOString?.().slice(0, 10) ?? inv.invoice_date).toBe("2026-10-17");
    expect((await rpc(c1, U.M, (tx) => tx`select public.data_entry_result_check(${p.preview.id}) j`)).j.ok).toBe(true);
    await admin`update standalone_invoices set total_amount=999 where id=${out.invoice_id}`;
    expect((await rpc(c1, U.M, (tx) => tx`select public.data_entry_result_check(${p.preview.id}) j`)).j.ok).toBe(false);
  });
  it("conferência completa detecta cada campo prometido; estado processado legítimo é atual separado", async () => {
    const p = await prepared(U.M, A, "%PDF-full-" + randomUUID(), fields({ invoice_number: "FULL-" + randomUUID(), notes: "  nota exata  " }));
    const out = (await rpc(c1, U.M, (tx) => tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash}) j`)).j;
    for (const [column, value] of Object.entries({ supplier_name: "Changed", file_name: "other.pdf", notes: out.observation,
      currency: "USD", original_amount: 1, fx_rate: 1, fx_rate_source: "client", supplier_nif: "PT999999999",
      invoice_number: "changed", created_by: U.Z, paid_by_partner_id: U.Z, storage_path: "other", company_id: B })) {
      await admin.begin(async (tx) => {
        if (column === "currency") await tx`update standalone_invoices set original_amount=1,fx_rate=1 where id=${out.invoice_id}`;
        await tx`update standalone_invoices set ${tx(column)}=${value} where id=${out.invoice_id}`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: U.M, role: "authenticated" })}, true)`;
        const [r] = await tx`select public.data_entry_result_check(${p.preview.id}) j`;
        expect([column, r.j.ok]).toEqual([column, false]);
        throw new Error("rollback mutation");
      }).catch((e) => { if (e.message !== "rollback mutation") throw e; });
    }
    await admin`update standalone_invoices set status='processed',processed_by=${U.Z},processed_at=now() where id=${out.invoice_id}`;
    const check = (await rpc(c1, U.M, (tx) => tx`select public.data_entry_result_check(${p.preview.id}) j`)).j;
    expect(check.ok).toBe(true); expect(check.result.status).toBe("new"); expect(check.persisted.status).toBe("processed");
    const empty = await prepared(U.M,A,"no-result-"+randomUUID(),fields({ invoice_number:"EMPTY-"+randomUUID() }));
    expect((await rpc(c1, U.M, (tx) => tx`select public.data_entry_result_check(${empty.preview.id}) j`)).j.result).toBeNull();
  });
  it("tabelas financeiras proibidas ficam intactas (triggers fariam falhar qualquer escrita)", async () => {
    const [r] = await admin`select (select count(*) from transactions)+(select count(*) from event_forecasts)+(select count(*) from financial_accounts)+(select count(*) from reimbursements)+(select count(*) from payment_lists)+(select count(*) from transaction_payments) n`;
    expect(Number(r.n)).toBe(0);
  });
});

describe("#333 concorrência real entre duas ligações", () => {
  it("mesmo lote/documento em duas ligações: a 2.ª espera e devolve o MESMO resultado; 1 avulsa", async () => {
    const num = "C1-" + randomUUID();
    const p = await prepared(U.M, A, "%PDF-c1-" + randomUUID(), fields({ invoice_number: num }));
    let release: () => void = () => {}; const gate = new Promise<void>((r) => (release = r)); let first: any;
    const t1 = as(c1, U.M, async (tx) => { first = (await tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash}) j`)[0].j; await gate; });
    while (!first) await new Promise((r) => setTimeout(r, 20));
    const t2 = as(c2, U.M, async (tx) => (await tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash}) j`)[0].j);
    expect(await pending(t2)).toBe(true);
    release(); await t1;
    expect((await t2).invoice_id).toBe(first.invoice_id);
    expect(Number((await admin`select count(*) n from standalone_invoices where invoice_number=${num}`)[0].n)).toBe(1);
  });
  it("dois lotes com a mesma fatura: o lock serializa e o 2.º recebe 'já existe'", async () => {
    const num = "C2-" + randomUUID();
    const p1 = await prepared(U.M, A, "%PDF-c2a-" + randomUUID(), fields({ invoice_number: num }));
    const p2 = await prepared(U.Z, A, "%PDF-c2b-" + randomUUID(), fields({ invoice_number: num.toLowerCase() }));
    let release: () => void = () => {}; const gate = new Promise<void>((r) => (release = r)); let done = false;
    const t1 = as(c1, U.M, async (tx) => { await tx`select public.data_entry_commit(${p1.preview.id},${p1.preview.snapshot_hash})`; done = true; await gate; });
    while (!done) await new Promise((r) => setTimeout(r, 20));
    const t2 = err(as(c2, U.Z, (tx) => tx`select public.data_entry_commit(${p2.preview.id},${p2.preview.snapshot_hash})`));
    expect(await pending(t2)).toBe(true);
    release(); await t1;
    expect((await t2)?.message).toMatch(/já existe/);
  });
  it("escritor legado com a MESMA grafia: o índice canónico bloqueia o 2.º (qualquer ordem)", async () => {
    for (const legacyFirst of [false, true]) {
      const num = `L${legacyFirst ? 1 : 0}-` + randomUUID();
      const p = await prepared(U.M, A, "%PDF-leg-" + randomUUID(), fields({ invoice_number: num }));
      let release: () => void = () => {}; const gate = new Promise<void>((r) => (release = r)); let held = false;
      const legacy = (tx: Tx) => tx`insert into standalone_invoices(company_id,storage_path,file_name,supplier_nif,invoice_number) values (${A},'x','x','PT500111222',${num})`;
      const ours = (tx: Tx) => tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash})`;
      const holder = legacyFirst ? admin.begin(async (tx) => { await legacy(tx); held = true; await gate; })
                                 : as(c1, U.M, async (tx) => { await ours(tx); held = true; await gate; });
      while (!held) await new Promise((r) => setTimeout(r, 20));
      const second = legacyFirst ? err(as(c2, U.M, ours)) : err(c2.begin((tx) => legacy(tx)));
      expect(await pending(second)).toBe(true);
      release(); await holder;
      expect((await second)?.code).toBe("23505");
      expect(Number((await admin`select count(*) n from standalone_invoices where invoice_number=${num}`)[0].n)).toBe(1);
      expect(Number((await admin`select count(*) n from data_entry_results where preview_id=${p.preview.id}`)[0].n)).toBe(legacyFirst ? 0 : 1);
    }
  });
  it("LIMITAÇÃO comprovada: legado com grafia normalizada diferente NÃO é bloqueado pelo índice actual", async () => {
    const num = "LV-" + randomUUID();
    const p = await prepared(U.M, A, "%PDF-lv-" + randomUUID(), fields({ invoice_number: num }));
    let release: () => void = () => {}; const gate = new Promise<void>((r) => (release = r)); let held = false;
    const holder = as(c1, U.M, async (tx) => { await tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash})`; held = true; await gate; });
    while (!held) await new Promise((r) => setTimeout(r, 20));
    const legacy = c2.begin((tx) => tx`insert into standalone_invoices(company_id,storage_path,file_name,supplier_nif,invoice_number) values (${A},'x','x','pt 500 111 222',${num.toLowerCase()})`);
    release(); await holder; await legacy;
    expect(Number((await admin`select count(*) n from standalone_invoices where upper(invoice_number)=upper(${num})`)[0].n)).toBe(2);
  });
});

describe("#333 falhas, rollback e retoma", () => {
  it("falha injectada após INSERT e antes da auditoria: nada fica; retoma grava uma vez", async () => {
    const num = "RB-" + randomUUID();
    const p = await prepared(U.M, A, "%PDF-rb-" + randomUUID(), fields({ invoice_number: num }));
    const e = await err(as(c1, U.M, async (tx) => { await tx`select set_config('test.fail_audit','on',true)`; return tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash})`; }));
    expect(e?.message).toBe("injected");
    expect(Number((await admin`select count(*) n from standalone_invoices where invoice_number=${num}`)[0].n)).toBe(0);
    const out = (await rpc(c1, U.M, (tx) => tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash}) j`)).j;
    expect(Number((await admin`select count(*) n from standalone_invoices where id=${out.invoice_id}`)[0].n)).toBe(1);
  });
  it("resposta perdida após COMMIT: retoma devolve o mesmo resultado e a conferência confere o persistido", async () => {
    const num = "TO-" + randomUUID();
    const p = await prepared(U.M, A, "%PDF-to-" + randomUUID(), fields({ invoice_number: num }));
    await rpc(c1, U.M, (tx) => tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash})`); // response "lost"
    const again = (await rpc(c2, U.M, (tx) => tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash}) j`)).j;
    const check = (await rpc(c2, U.M, (tx) => tx`select public.data_entry_result_check(${p.preview.id}) j`)).j;
    expect(check.ok).toBe(true); expect(check.persisted.id).toBe(again.invoice_id);
    expect(Number((await admin`select count(*) n from standalone_invoices where invoice_number=${num}`)[0].n)).toBe(1);
  });
  it("registos técnicos são imutáveis", async () => {
    expect((await err(admin`update data_entry_previews set version=99`))?.message).toMatch(/imutável/);
    expect((await err(admin`delete from data_entry_storage_receipts`))?.message).toMatch(/imutável/);
  });
});


describe("#333 handler + PostgreSQL real + storage fake: interleaving final partilhado", () => {
  it.each(["40001", "08006"])("P1 suspenso, P2 nova versão COMMIT, P1 %s: bytes e 1 avulsa/auditoria intactos", async (failure) => {
    const bytes = pdfFixture(); const h = sha(Buffer.from(bytes));
    const sid = (await rpc(c1,U.M,(tx) => tx`select public.data_entry_session() j`)).j.session.id;
    await receipt("data-entry-staging",`${A}/${sid}/${h}`,h,bytes.length,"application/pdf");
    const did = (await rpc(c1,U.M,(tx) => tx`select public.data_entry_add_document(${sid},'f.pdf',${h},${bytes.length},'application/pdf') j`)).j.id;
    const f = fields({ invoice_number: "BARRIER-"+randomUUID() });
    const p1 = (await rpc(c1,U.M,(tx) => tx`select public.data_entry_prepare(${sid},${did},${tx.json(f)}) j`)).j;
    const store = new Map<string,Uint8Array>([[`data-entry-staging/${A}/${sid}/${h}`,bytes]]);
    let release: () => void = () => {}; let entered: () => void = () => {};
    const barrier = new Promise<void>((r) => { release=r; }); const waiting = new Promise<void>((r) => { entered=r; });
    const deps: Deps = {
      getUser: async () => ({id:U.M}), cors:{}, uploadEnabled:true,
      async userRpc(token,name,args) {
        const sql = token === "p1" ? c1 : c2;
        if(name === "my_effective_permissions") return {data:{role:"manager",company_id:A},error:null};
        if(name === "data_entry_commit" && token === "p1") { entered(); await barrier; if(failure === "08006") return {data:null,error:{code:failure,message:"connection lost"}}; }
        try {
          const row = await rpc(sql,U.M,(tx) => {
            if(name === "data_entry_session") return tx`select public.data_entry_session(${args.p_session},null) j`;
            if(name === "data_entry_commit") return tx`select public.data_entry_commit(${args.p_preview},${args.p_snapshot_hash}) j`;
            if(name === "data_entry_result_check") return tx`select public.data_entry_result_check(${args.p_preview}) j`;
            throw new Error("unlisted RPC");
          }); return {data:row.j,error:null};
        } catch(e) { const x=e as {code:string;message:string}; return {data:null,error:{code:x.code,message:x.message}}; }
      },
      async recordReceipt(b,p,h,n,m) { await receipt(b,p,h,n,m); return {data:null,error:null}; },
      storage: {
        async upload(b,p,value) { const k=`${b}/${p}`; if(store.has(k)) return {error:{conflict:true}}; store.set(k,value); return {error:null}; },
        async download(b,p) { return store.get(`${b}/${p}`) ?? null; },
      },
    };
    const handle=createHandler(deps);
    const request=(token:string,p:any,action="execute") => new Request("http://fixture/",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(action==="check" ? {action,session_id:sid,preview_id:p.id} : {action,session_id:sid,preview_id:p.id,snapshot_hash:p.snapshot_hash,authorize:true})});
    const first=handle(request("p1",p1)); await waiting;
    const p2=(await rpc(c2,U.M,(tx) => tx`select public.data_entry_prepare(${sid},${did},${tx.json({...f,notes:"version2"})}) j`)).j;
    expect((await (await handle(request("p2",p2))).json()).status).toBe("conferido");
    release(); expect((await (await first).json()).status).toBe("por_confirmar");
    expect(store.get(`standalone-invoices/${A}/assistant333/${did}/${h}.pdf`)).toEqual(bytes);
    expect(Number((await admin`select count(*) n from standalone_invoices where invoice_number=${f.invoice_number}`)[0].n)).toBe(1);
    expect(Number((await admin`select count(*) n from data_entry_results where document_id=${did}`)[0].n)).toBe(1);
    expect((await (await handle(request("p2",p2,"check"))).json()).status).toBe("conferido");
  });
});


describe("#333 EXACT proposed index on real compatible standalone table (local ONLY)", () => {
  beforeAll(async () => {
    const activeSource=readFileSync("supabase/manual/20261017_issue333_core.PENDENTE.sql","utf8");
    // Main-tree helper validation remains inert; isolated runner executes the complete patched core at setup.
    const source=activeSource.includes("CREATE FUNCTION public.data_entry_identity") ? activeSource : readFileSync("patches/issue333/core.PENDENTE.sql","utf8");
    const start=source.indexOf("CREATE FUNCTION public.data_entry_identity");
    const end=source.indexOf("CREATE FUNCTION public.data_entry_result_check",start);
    if (start >= 0 && end > start) await admin.unsafe(source.slice(start,end).replaceAll("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
    // Byte-for-byte proposal, including CONCURRENTLY, executed outside transaction locally.
    await admin.unsafe(readFileSync("supabase/manual/20261017_issue333_normalized_uniqueness.PROPOSTA.sql","utf8"));
  });
  const legacy=async(tx:Tx,nif:string,num:string,company=A)=> {
    await tx`set local role service_role`;
    return tx`insert into standalone_invoices(company_id,storage_path,file_name,supplier_name,supplier_nif,invoice_number,invoice_date,currency,original_amount,fx_rate,fx_rate_source,total_amount,iva_amount,notes,paid_by_partner_id,created_by,status)
      values (${company},${company+'/fixture/'+randomUUID()},'fixture.pdf','Fornecedor Fictício',${nif},${num},'2026-10-17','EUR',null,null,null,123,23,'nota',${U.P},${U.M},'new') returning id`;
  };
  it("index valid/ready; proposed strong function matches JS bytes with prefixes/separators/nonASCII",async()=>{
    const r=(await admin`select indisvalid,indisready from pg_index where indexrelid='uq_standalone_invoice_normalized_333'::regclass`)[0];
    expect(r).toEqual({indisvalid:true,indisready:true});
    for(const input of [null,'','   ',' pt001 ','FT1/23','FT12/3','AB-12','AB1-2','\tpt01\t','áA']) {
      const out=(await admin`select public.data_entry_identity(${input}) v`)[0].v;
      expect(out).toBe(input===null?null:input.replace(/^ +| +$/g,'').replace(/[a-z]/g,(c)=>c.toUpperCase())||null);
    }
  });
  it.each([true,false])("assistant × adapted real legacy INSERT equivalent; legacy first=%s",async(legacyFirst)=>{
    const num='STRONG-'+randomUUID();const p=await prepared(U.M,A,'strong-'+randomUUID(),fields({invoice_number:num}));
    let entered:()=>void=()=>{},release:()=>void=()=>{};const ready=new Promise<void>(r=>{entered=r;});const barrier=new Promise<void>(r=>{release=r;});
    const ours=(tx:Tx)=>tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash})`;
    const first=legacyFirst?c1.begin(async(tx)=>{await legacy(tx,'pt500111222',' '+num.toLowerCase()+' ');entered();await barrier;})
      :as(c1,U.M,async(tx)=>{await ours(tx);entered();await barrier;});
    await ready;
    const second=err(legacyFirst?as(c2,U.M,ours):c2.begin(tx=>legacy(tx,'pt500111222',' '+num.toLowerCase()+' ')));
    try {expect(await pending(second)).toBe(true);} finally {release();}
    await first;expect((await second)?.code).toBe('23505');
    expect(Number((await admin`select count(*) n from standalone_invoices where public.data_entry_identity(invoice_number)=public.data_entry_identity(${num})`)[0].n)).toBe(1);
    expect(Number((await admin`select count(*) n from data_entry_results where preview_id=${p.preview.id}`)[0].n)).toBe(legacyFirst?0:1);
  });
  it.each([true,false])("legacy × legacy INSERT both orders firstLower=%s",async(lower)=>{
    const num='LEGACY-'+randomUUID();let entered:()=>void=()=>{},release:()=>void=()=>{};
    const ready=new Promise<void>(r=>{entered=r;});const barrier=new Promise<void>(r=>{release=r;});
    const first=c1.begin(async(tx)=>{await legacy(tx,lower?'pt001':'PT001',lower?' '+num.toLowerCase()+' ':num);entered();await barrier;});await ready;
    const second=err(c2.begin(tx=>legacy(tx,lower?'PT001':'pt001',lower?num:' '+num.toLowerCase()+' ')));
    try {expect(await pending(second)).toBe(true);} finally {release();}
    await first;expect((await second)?.code).toBe('23505');
  });
  it("UPDATE metadata key collision rolls back fields, status and file reference",async()=>{
    const num='EDIT-'+randomUUID();await c1.begin(tx=>legacy(tx,'PT001',num));
    const row=(await c1.begin(tx=>legacy(tx,'PT001','OTHER-'+num)))[0];
    const before=(await admin`select * from standalone_invoices where id=${row.id}`)[0];
    const failure=await err(c2.begin(async(tx)=>{
      await tx`set local role service_role`;
      await tx`update standalone_invoices set supplier_nif='pt001',invoice_number=${' '+num.toLowerCase()+' '},notes='changed',status='processed' where id=${row.id}`;
    }));expect(failure?.code).toBe('23505');
    expect((await admin`select * from standalone_invoices where id=${row.id}`)[0]).toEqual(before);
  });
  it.each([true,false])("legacy INSERT × legacy UPDATE collision with barrier; insert first=%s",async(insertFirst)=>{
    const num='UPDATE-RACE-'+randomUUID();const row=(await c1.begin(tx=>legacy(tx,'PT001','SOURCE-'+num)))[0];
    const edit=async(tx:Tx)=>{await tx`set local role service_role`;return tx`update standalone_invoices set invoice_number=${' '+num.toLowerCase()+' '},supplier_nif='pt001' where id=${row.id}`;};
    let entered:()=>void=()=>{},release:()=>void=()=>{};const ready=new Promise<void>(r=>{entered=r;});const barrier=new Promise<void>(r=>{release=r;});
    const first=c1.begin(async(tx)=>{if(insertFirst)await legacy(tx,'PT001',num);else await edit(tx);entered();await barrier;});await ready;
    const second=err(c2.begin(tx=>insertFirst?edit(tx):legacy(tx,'PT001',num)));
    try {expect(await pending(second)).toBe(true);} finally {release();}
    await first;expect((await second)?.code).toBe('23505');
  });
  it("FT1/23 vs FT12/3 and AB-12 vs AB1-2 DISTINCT; no similarity identity",async()=>{
    for(const [a,b] of [['FT1/23','FT12/3'],['AB-12','AB1-2']]) {
      const nif='PT'+randomUUID();await c1.begin(tx=>legacy(tx,nif,a));
      // Real assistant permits the ambiguous b itself, not an unrelated suffix.
      const p=await prepared(U.M,A,'distinct-'+randomUUID(),fields({supplier_nif:nif,invoice_number:b}));
      expect((await rpc(c1,U.M,tx=>tx`select public.data_entry_commit(${p.preview.id},${p.preview.snapshot_hash}) j`)).j.invoice_id).toBeTruthy();
      expect(Number((await admin`select count(*) n from standalone_invoices where supplier_nif=${nif}`)[0].n)).toBe(2);
    }
  });
  it("NULL/SPACE empty repeat; prefixes/zeros/separators/company independently preserved",async()=>{
    const num='NULL-'+randomUUID();
    for(let n=0;n<2;n++)await admin`insert into standalone_invoices(company_id,storage_path,file_name,supplier_nif,invoice_number) values
      (${A},'fixture','f',null,${num}),(${A},'fixture','f','   ',${num+n}),(${A},'fixture','f',${'INCOMPLETE-'+n},null)`;
    for(const nif of ['PT001','001','PT01','PT 001','PT-001'])await c1.begin(tx=>legacy(tx,nif,num));
    await c1.begin(tx=>legacy(tx,'PT001',num,B));
    expect(Number((await admin`select count(*) n from standalone_invoices where invoice_number=${num}`)[0].n)).toBe(8);
  });
  it("strong duplicate 23505 failure rollback permits waiting competitor, no duplicate audit",async()=>{
    const num='ROLL-STRONG-'+randomUUID();let entered:()=>void=()=>{},release:()=>void=()=>{};
    const ready=new Promise<void>(r=>{entered=r;});const barrier=new Promise<void>(r=>{release=r;});
    const first=err(c1.begin(async(tx)=>{await legacy(tx,'PT001',num);entered();await barrier;throw new Error('injected rollback');}));await ready;
    const second=c2.begin(tx=>legacy(tx,'pt001',num.toLowerCase()));
    try {expect(await pending(second)).toBe(true);}finally{release();}
    await first;await second;
    expect(Number((await admin`select count(*) n from standalone_invoices where public.data_entry_identity(invoice_number)=public.data_entry_identity(${num})`)[0].n)).toBe(1);
  });
  it("prepared real ingest adapter × PostgreSQL index + fake bytes: 23505/document conflict/unknown, preserved files",async()=>{
    const bytes=pdfFixture();const files=new Map<string,Uint8Array>();let inject="race";let insertCount=0;
    const num='INGEST-'+randomUUID();
    const expected:Expected={company_id:A,supplier_nif:'PT001',invoice_number:num,file_name:'fixture.pdf',supplier_name:'Fornecedor Fictício',
      invoice_date:'2026-10-17',currency:'EUR',original_amount:null,fx_rate:null,fx_rate_source:null,total_amount:123,iva_amount:23,notes:'nota',paid_by_partner_id:U.P,created_by:U.M};
    const store:Store={
      find:(e)=>findStrongCandidates(e,async(company,after,size)=>{
        const rows=await admin`select * from standalone_invoices where company_id=${company} and (${after}::uuid is null or id>${after}::uuid) order by id limit ${size}`;
        return rows.map((r)=>({...r,invoice_date:r.invoice_date?.toISOString?.().slice(0,10)??r.invoice_date})) as Candidate[];
      }),
      get:async(id,company)=>{const [r]=await admin`select * from standalone_invoices where id=${id} and company_id=${company}`;return r?{...r,invoice_date:r.invoice_date?.toISOString?.().slice(0,10)??r.invoice_date} as Candidate:null;},
      read:async(p)=>files.get(p)??null,
      upload:async(p,b)=>{files.set(p,b);},
      insert:async(row)=>{
        insertCount++;
        if(inject==='race') {
          const other={...row,supplier_nif:'pt001',invoice_number:num.toLowerCase(),storage_path:A+'/existing'};
          files.set(other.storage_path,bytes);
          await c2`insert into standalone_invoices ${c2(other)} returning id`;
        }
        const [r]=await c1`insert into standalone_invoices ${c1(row)} returning id,storage_path`;
        if(inject==='unknown')throw new Error('lost committed response');
        return r as {id:string;storage_path:string};
      },
    };
    const r=await persistInvoice(store,expected,bytes,'application/pdf',A+'/candidate');
    expect(r.status).toBe(200);expect(r.body.reused).toBe(true);expect(insertCount).toBe(1);expect(files.size).toBe(2);
    expect((await persistInvoice(store,{...expected,total_amount:124},bytes,'application/pdf',A+'/never')).status).toBe(409);
    inject='unknown';const next={...expected,invoice_number:num+'-UNKNOWN'};
    expect((await persistInvoice(store,next,bytes,'application/pdf',A+'/unknown')).status).toBe(503);
    expect((await persistInvoice(store,next,bytes,'application/pdf',A+'/retry')).body.reused).toBe(true);
    expect(insertCount).toBe(2);expect(files.has(A+'/retry')).toBe(false);
  });
});
