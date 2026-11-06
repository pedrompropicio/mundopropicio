// @vitest-environment node
// Propostas intercaladas, RPCs reais e restrições PostgreSQL em catálogo sintético.
// PGlite tem uma sessão: estes schedules provam revalidação após o vencedor,
// unicidade e atomicidade; não alegam medir espera/deadlocks de duas ligações.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PositionHarness, A, OFF, C, U, uid, q, migration,
  sales, opening, carry, confirmSql,
} from "./issue303-position.test";

describe("#303 / 0347 — propostas intercaladas e locks herdados da 0346",()=>{
  const h=new PositionHarness();
  beforeAll(()=>h.init(),30000);afterAll(async()=>{await h.db?.close();});
  beforeEach(()=>h.begin());afterEach(()=>h.end());

  it.each([0,1])("duas propostas de abertura: só o vencedor %i consome a excepção",async winner=>{
    const a=await h.draft({lines:[opening(-1000)]});
    const b=await h.draft({lines:[opening(-2000)]});
    const drafts=[a,b],loser=1-winner;
    const r=await h.confirm(drafts[winner].s,true);
    await h.fails(confirmSql(drafts[loser].s,true),"opening_first_admin_approval_required");
    expect(await h.confirm(drafts[winner].s,true)).toEqual(r);
    await h.owner();
    expect(await h.value(`SELECT count(*)::int FROM ticket_office_statements WHERE financial_account_id=${q(A)} AND opening_balance_line_id IS NOT NULL`)).toBe(1);
    expect(await h.value(`SELECT status FROM ticket_office_statements WHERE id=${q(drafts[loser].s.statement_id)}`)).toBe("draft");
    expect(await h.value("SELECT count(*)::int FROM issue303_private.command_context")).toBe(0);
  });

  it.each([0,-1000])("duas propostas de sucessor, predecessor com saldo %i: reserva única já no draft",async balance=>{
    await h.prepareRights([1,2]);
    const root=await h.draft({lines:[opening(balance)]});await h.confirm(root.s,true);
    const lines=()=>balance===0?[sales(1)]:[carry(root.s.statement_id,balance),sales(1)];
    const one=await h.draft({lines:lines(),date:"2026-10-02",predecessor:root.s.statement_id});
    // Ambos os proponentes escolheram o mesmo predecessor antes do primeiro
    // confirmar. A 0345 reserva o elo também em draft, pelo índice persistente.
    await h.db.exec("SAVEPOINT competing_draft");
    try {
      await expect(h.draft({lines:balance===0?[sales(2)]:[carry(root.s.statement_id,balance),sales(2)],
        date:"2026-10-03",predecessor:root.s.statement_id})).rejects.toMatchObject({code:"23505"});
    } finally {await h.db.exec("ROLLBACK TO competing_draft; RELEASE SAVEPOINT competing_draft");}
    await h.actor();await h.confirm(one.s);
    await h.owner();expect(await h.value(`SELECT count(*)::int FROM ticket_office_statements WHERE predecessor_statement_id=${q(root.s.statement_id)}`)).toBe(1);
  });

  it.each([A,OFF])("mesmo evento em duas contas: só confirma a conta vencedora %s",async winner=>{
    // Dois fechos candidatos preexistentes; não produzir efeitos financeiros.
    await h.owner();await h.db.exec(`INSERT INTO ticket_office_settlements
      (id,company_id,financial_account_id,event_id,status,net_calculated,closed_at,settlement_date)
      VALUES (${q(uid(3000))},${q(C)},${q(OFF)},${q(uid(1000))},'confirmed',100,'2026-01-01T10:00:00Z','2026-01-01')`);
    await h.enable([A,OFF]);
    const a=await h.draft({account:A});
    const b=await h.draft({account:OFF,lines:[{...sales(),ticket_office_settlement_id:uid(3000)}]});
    const first=winner===A?a:b,second=winner===A?b:a;
    const before=await h.snapshot();await h.actor();
    await h.confirm(first.s);await h.fails(confirmSql(second.s),"event_already_confirmed","23505");
    await h.owner();
    expect(await h.value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(1);
    expect(await h.value(`SELECT financial_account_id FROM ticket_office_statement_events WHERE event_id=${q(uid(1000))}`)).toBe(winner);
    expect(await h.value(`SELECT status FROM ticket_office_statements WHERE id=${q(second.s.statement_id)}`)).toBe("draft");
    expect(await h.snapshot()).toEqual(before);
  });

  it("edição intercalada invalida a revisão anterior; retry da confirmação é idempotente",async()=>{
    const d=await h.draft();
    const revised=await h.value<{statement_id:string;revision:number}>(d.saveSql());
    expect(revised.revision).toBe(d.s.revision+1);
    await h.fails(confirmSql(d.s),"revision_conflict","40001");
    const receipt=await h.confirm(revised);expect(await h.confirm(revised)).toEqual(receipt);
    await h.owner();expect(await h.value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(1);
  });

  it("r4 conserva as ordens conta → pais UUID → eventos UUID da 0346 sem novos locks de pais",async()=>{
    await h.owner();
    for(const signature of ["issue303_private.lock_document(uuid)","public.save_ticket_office_statement_draft(uuid,bigint,jsonb)"]){
      const body=await h.value<string>(`SELECT prosrc FROM pg_proc WHERE oid=${q(signature)}::regprocedure`);
      const account=body.indexOf("FROM public.financial_accounts");
      const parents=body.indexOf("FROM public.ticket_office_statements",account);
      const events=body.indexOf("FROM public.events",parents);
      expect(account).toBeGreaterThan(-1);expect(parents).toBeGreaterThan(account);expect(events).toBeGreaterThan(parents);
      expect(body.slice(parents,events)).toMatch(/ORDER BY id FOR UPDATE/);
      expect(body.slice(events)).toMatch(/ORDER BY id FOR UPDATE/);
    }
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION (?:public\.|issue303_private\.lock_document)/);
    const validator=await h.value<string>("SELECT prosrc FROM pg_proc WHERE oid='issue303_private.r4_validate(uuid,bigint)'::regprocedure");
    expect(validator).not.toMatch(/FROM public\.(?:financial_accounts|ticket_office_statements|events)[^;]*FOR (?:UPDATE|SHARE)/s);
    const writer=await h.value<string>("SELECT prosrc FROM pg_proc WHERE oid='issue303_private.receipt_source_guard()'::regprocedure");
    expect(writer.indexOf("FROM public.financial_accounts")).toBeLessThan(writer.indexOf("lock_source_keys"));
  });
});

describe("#303 / instalação opcional da capacidade R4",()=>{
  const h=new PositionHarness();
  beforeAll(()=>h.init(false),30000);afterAll(async()=>{await h.db?.close();});
  beforeEach(()=>h.begin());afterEach(()=>h.end());

  it("0346 isolada mantém a recusa; só instalar o candidato em memória disponibiliza a validação",async()=>{
    const {s,vid}=await h.draft();await h.fails(confirmSql(s),"capacidade_r4_em_falta","55000");
    await h.owner();
    const signatures=["public.confirm_ticket_office_statement(uuid,bigint,boolean)","issue303_private.lock_document(uuid)",
      "public.save_ticket_office_statement_draft(uuid,bigint,jsonb)"];
    const definitions=await Promise.all(signatures.map(sig=>h.value(`SELECT pg_get_functiondef(${q(sig)}::regprocedure)`)));
    // Retirar apenas os delimitadores do candidato para manter a transacção do teste.
    await h.db.exec(migration.slice(migration.indexOf("BEGIN;")+6,migration.lastIndexOf("COMMIT;")));
    for(let i=0;i<signatures.length;i++)expect(await h.value(`SELECT pg_get_functiondef(${q(signatures[i])}::regprocedure)`)).toBe(definitions[i]);
    await h.db.exec(`INSERT INTO issue303_private.position_evidence(verified_file_id,document_page,document_ref)
      VALUES (${q(vid)},1,'PDF sintético conferido: só data')`);
    await h.actor(U);expect((await h.confirm(s)).independent_position).toBe(100);
  });
});
