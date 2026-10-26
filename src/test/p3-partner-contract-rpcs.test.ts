// @vitest-environment node
// Credential-free PostgreSQL execution; no hosted requests or notifications.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/manual/0273_p3_partner_contract_rpcs.sql','utf8');
const company='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const uid='00000000-0000-0000-0000-000000000003';
let db: PGlite;
let participant:string, supplier:string, event:string, settlement:string, category:string;
async function q<T = Record<string, unknown>>(s:string){return (await db.query<T>(s)).rows;}
async function create(gross=1000, extra="false,NULL,NULL",key='NULL',adv="'{}'") {
 const r=await q<{id:string}>(`SELECT create_partner_payment_contract('${participant}','${supplier}',${gross},${extra},'2026-11-30',${adv},NULL,${key}) id`);
 return r[0].id;
}
async function advance(amount=100,status='approved') {
 return (await q<{id:string}>(`INSERT INTO transactions(company_id,event_id,supplier_id,category_id,type,description,amount,date,status)
 VALUES('${company}','${event}','${supplier}','${category}','expense','advance',${amount},'2026-10-26','${status}') RETURNING id`))[0].id;
}
async function roots(cid:string){return q<{id:string;partner_contract_role:string;amount:string}>(`SELECT * FROM transactions WHERE partner_contract_id='${cid}' ORDER BY partner_contract_role`);}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.company',true),'')::uuid$$;
 CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT nullif(current_setting('test.role',true),'')=$2$$;
 CREATE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT nullif(current_setting('test.permission',true),'')=$2$$;
 CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE TABLE events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,result numeric DEFAULT 760576.69);
 CREATE TABLE suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,name text);
 CREATE TABLE account_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,code text);
 CREATE TABLE event_settlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,event_id uuid,is_sealed boolean DEFAULT false);
 CREATE TABLE event_settlement_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,event_id uuid,settlement_id uuid,
 supplier_id uuid,mode text DEFAULT 'settles',frozen_at timestamptz DEFAULT now(),frozen_values jsonb DEFAULT '{"share_amount":418598.65}');
 CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,event_id uuid,type text NOT NULL,category_id uuid,
 description text NOT NULL,amount numeric NOT NULL,iva_rate int DEFAULT 0,date date NOT NULL,due_date date,status text DEFAULT 'approved',supplier_id uuid,
 account_id uuid,paid_amount numeric DEFAULT 0,payment_date date,reversed_at timestamptz,parent_transaction_id uuid,cache_contract_id uuid,
 invoice_group_id uuid,currency text DEFAULT 'EUR',is_transitory boolean DEFAULT false,transitory_reason text);
 CREATE TABLE system_audit_log(id uuid DEFAULT gen_random_uuid(),entity_type text,entity_id text,action text,changed_by text,old_data jsonb,new_data jsonb,metadata jsonb,company_id uuid);
 CREATE TABLE trash(id uuid DEFAULT gen_random_uuid(),entity_type text,entity_id uuid,entity_data jsonb,related_data jsonb,deleted_by text,company_id uuid,
 deleted_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '30 days');
 CREATE TABLE payment_lists(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text);
 CREATE TABLE payment_list_items(id uuid DEFAULT gen_random_uuid(),payment_list_id uuid REFERENCES payment_lists(id),transaction_id uuid REFERENCES transactions(id),removed_at timestamptz);
 CREATE TABLE reimbursement_notes(payment_transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE reimbursement_note_items(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE event_forecasts(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE event_ticket_office_advances(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE ticket_office_statement_lines(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE transaction_payments(transaction_id uuid REFERENCES transactions(id),amount numeric);
 CREATE TABLE transaction_offsets(receivable_transaction_id uuid REFERENCES transactions(id),payable_transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE transaction_offset_items(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE bank_line_transactions(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE bank_statement_lines(matched_transaction_id uuid REFERENCES transactions(id),created_transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE partner_paid_expenses(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE partner_advance_expenses(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE supplier_credit_usages(transaction_id uuid REFERENCES transactions(id));
 CREATE TABLE transaction_documents(transaction_id uuid REFERENCES transactions(id));
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
 await db.exec(readFileSync('supabase/manual/0271_p3_partner_contracts_tables.sql','utf8'));
 const capital=readFileSync('supabase/manual/0272_p3_transitory_reason_10_1_03.sql','utf8');
 await db.exec(`ALTER TABLE transactions ADD CONSTRAINT transactions_transitory_reason_domain CHECK(transitory_reason IS NULL OR transitory_reason IN
 ('partner_advance','repasse','caucao','emprestimo_socio','carga_cartao','aporte_socio','entrada_a_repassar','devolucao_socio'));
 ALTER TABLE transactions ADD CONSTRAINT transactions_transitory_reason_required CHECK(NOT is_transitory OR transitory_reason IS NOT NULL);`);
 await db.exec(capital);
 await db.exec(`CREATE TRIGGER trg_force_transitory_capital BEFORE INSERT OR UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION force_transitory_for_capital_branch();`);
 await db.exec(sql);
},60000);
beforeEach(async()=>{
 await db.exec(`TRUNCATE transactions,partner_payment_contracts,event_settlement_participants,event_settlements,events,suppliers,account_categories,
 payment_lists,payment_list_items,reimbursement_notes,reimbursement_note_items,event_forecasts,event_ticket_office_advances,ticket_office_statement_lines,
 transaction_payments,transaction_offsets,transaction_offset_items,bank_line_transactions,bank_statement_lines,partner_paid_expenses,partner_advance_expenses,
 supplier_credit_usages,transaction_documents,trash,system_audit_log CASCADE;
 SELECT set_config('test.uid','${uid}',false),set_config('test.company','${company}',false),set_config('test.role','admin',false),set_config('test.permission','',false);`);
 supplier=(await q<{id:string}>(`INSERT INTO suppliers(company_id,name) VALUES('${company}','Sócio') RETURNING id`))[0].id;
 await db.exec(`INSERT INTO suppliers(company_id,name) VALUES('${company}','MINISTERIO DAS FINANCAS - IRS')`);
 event=(await q<{id:string}>(`INSERT INTO events(company_id) VALUES('${company}') RETURNING id`))[0].id;
 settlement=(await q<{id:string}>(`INSERT INTO event_settlements(company_id,event_id) VALUES('${company}','${event}') RETURNING id`))[0].id;
 participant=(await q<{id:string}>(`INSERT INTO event_settlement_participants(company_id,event_id,settlement_id,supplier_id)
 VALUES('${company}','${event}','${settlement}','${supplier}') RETURNING id`))[0].id;
 category=(await q<{id:string}>(`INSERT INTO account_categories(company_id,code) VALUES('${company}','10.1.03') RETURNING id`))[0].id;
});
afterAll(async()=>{await db?.close();});
describe('P3 0273 RPCs manual-only',()=>{
 it('creates approved 10.1.03 balance, trigger derives reason, zero IVA and no account',async()=>{
  const c=await create(); const [t]=await roots(c);
  expect(t).toMatchObject({amount:'1000',status:'approved',is_transitory:true,transitory_reason:'distribuicao_resultado',account_id:null,iva_rate:0,category_id:category,event_id:event,partner_contract_role:'balance'});
 });
 it('optional explicit withholding creates exactly two transactions 750 + 250',async()=>{
  const c=await create(1000,"true,25,'2026-12-20'");
  expect((await roots(c)).map(t=>[t.partner_contract_role,Number(t.amount)])).toEqual([['balance',750],['withholding',250]]);
 });
 it('rejects unanswered withholding',async()=>{await expect(create(1000,'NULL,NULL,NULL')).rejects.toThrow('retencao_sem_resposta');});
 it('rejects missing due date',async()=>{await expect(q(`SELECT create_partner_payment_contract('${participant}','${supplier}',1000,false,NULL,NULL,NULL)`)).rejects.toThrow('vencimento_obrigatorio');});
 it('rejects unfrozen participant',async()=>{await db.exec(`UPDATE event_settlement_participants SET frozen_at=NULL`);await expect(create()).rejects.toThrow('socio_nao_congelado');});
 it('rejects nominal participant',async()=>{await db.exec(`UPDATE event_settlement_participants SET mode='nominal'`);await expect(create()).rejects.toThrow('socio_nao_congelado');});
 it('rejects missing frozen share',async()=>{await db.exec(`UPDATE event_settlement_participants SET frozen_values='{}'`);await expect(create()).rejects.toThrow('parte_congelada_em_falta');});
 it.each(['NaN','Infinity','no'])('rejects invalid frozen share %s',async v=>{await db.exec(`UPDATE event_settlement_participants SET frozen_values=jsonb_build_object('share_amount','${v}')`);await expect(create()).rejects.toThrow('parte_congelada_invalida');});
 it('rejects sealed settlement',async()=>{await db.exec(`UPDATE event_settlements SET is_sealed=true`);await expect(create()).rejects.toThrow('fechamento_selado');});
 it('rejects wrong company',async()=>{await db.exec(`SELECT set_config('test.company','${other}',false)`);await expect(create()).rejects.toThrow('participante_invalido');});
 it('fails closed for NULL permission or no session',async()=>{await db.exec(`SELECT set_config('test.role','',false)`);await expect(create()).rejects.toThrow('Sem permissão');await db.exec(`SELECT set_config('test.role','admin',false),set_config('test.uid','',false)`);await expect(create()).rejects.toThrow('Sem permissão');});
 it.each(['manager','manage_bp'])('allows actor %s',async role=>{await db.exec(`SELECT set_config('test.role','${role==='manager'?'manager':''}',false),set_config('test.permission','${role==='manage_bp'?role:''}',false)`);expect(await create()).toBeTruthy();});
 it('maximum four active contracts',async()=>{for(let i=0;i<4;i++)await create();await expect(create()).rejects.toThrow('limite_contratos');expect((await q<{c:number}>(`SELECT count(*)::int c FROM partner_payment_contracts`))[0].c).toBe(4);});
 it('sum cannot exceed 418598.65 frozen share',async()=>{await create(418598.65);await expect(create(.01)).rejects.toThrow('parte_excedida');});
 it('rounds withholding to cents, rejects gross with fractional cents',async()=>{const c=await create(10.01,"true,25,'2026-12-20'");expect((await roots(c)).map(t=>t.amount)).toEqual(['7.51','2.50']);await expect(create(1.001)).rejects.toThrow('bruto_invalido');});
 it('idempotent exact retry creates only one contract; conflicting payload fails',async()=>{const c=await create(1000,'false,NULL,NULL',"'same'");expect(await create(1000,'false,NULL,NULL',"'same'")).toBe(c);await expect(create(2000,'false,NULL,NULL',"'same'")).rejects.toThrow('idempotency_key_conflito');expect((await roots(c)).length).toBe(1);});
 it('attaches indivisible advance without changing amount or category, retries safely',async()=>{const a=await advance();const c=await create();await q(`SELECT attach_partner_advance_to_contract('${c}','${a}')`);await q(`SELECT attach_partner_advance_to_contract('${c}','${a}')`);expect((await q(`SELECT amount,category_id,partner_contract_role FROM transactions WHERE id='${a}'`))[0]).toEqual({amount:'100',category_id:category,partner_contract_role:'advance'});expect((await roots(c))[1].amount).toBe('900');});
 it('cannot reuse advance in two contracts',async()=>{const a=await advance();const c=await create();const d=await create();await q(`SELECT attach_partner_advance_to_contract('${c}','${a}')`);await expect(q(`SELECT attach_partner_advance_to_contract('${d}','${a}')`)).rejects.toThrow('adiantamento_invalido');});
 it('negative balance leaves advance free',async()=>{const a=await advance(1001);const c=await create();await expect(q(`SELECT attach_partner_advance_to_contract('${c}','${a}')`)).rejects.toThrow('saldo_negativo');expect((await q(`SELECT partner_contract_id FROM transactions WHERE id='${a}'`))[0].partner_contract_id).toBeNull();});
 it('creation attaches deduplicated advance IDs exactly once',async()=>{const a=await advance();const c=await create(1000,'false,NULL,NULL','NULL',`ARRAY['${a}'::uuid,'${a}'::uuid]`);expect((await roots(c)).map(t=>t.amount)).toEqual(['100','900']);});
 it('replaces atomically and records replaced_by',async()=>{const c=await create();const [r]=await q<{id:string}>(`SELECT update_partner_payment_contract('${c}','${supplier}',500,false,NULL,NULL,'2026-12-01') id`);expect((await q(`SELECT replaced_by FROM partner_payment_contracts WHERE id='${c}'`))[0].replaced_by).toBe(r.id);expect((await roots(r.id))[0].amount).toBe('500');});
 it('failed replacement rolls cancellation and trash back',async()=>{const c=await create();await expect(q(`SELECT update_partner_payment_contract('${c}','${supplier}',500000,false,NULL,NULL,'2026-12-01')`)).rejects.toThrow('parte_excedida');expect((await roots(c)).length).toBe(1);expect((await q(`SELECT cancelled_at FROM partner_payment_contracts WHERE id='${c}'`))[0].cancelled_at).toBeNull();expect((await q<{c:number}>(`SELECT count(*)::int c FROM trash`))[0].c).toBe(0);});
 it.each(['paid','payment','list','bank','bank_line','offset','offset_item'])('cancel blocked by %s without effects',async blocker=>{
  const c=await create();const t=(await roots(c))[0].id;
  const statements:Record<string,string>={paid:`UPDATE transactions SET paid_amount=1 WHERE id='${t}'`,payment:`INSERT INTO transaction_payments VALUES('${t}',1)`,
   list:`WITH p AS(INSERT INTO payment_lists(status) VALUES('approved') RETURNING id) INSERT INTO payment_list_items(payment_list_id,transaction_id) SELECT id,'${t}' FROM p`,
   bank:`INSERT INTO bank_statement_lines(matched_transaction_id) VALUES('${t}')`,bank_line:`INSERT INTO bank_line_transactions VALUES('${t}')`,
   offset:`INSERT INTO transaction_offsets VALUES('${t}','${t}')`,offset_item:`INSERT INTO transaction_offset_items VALUES('${t}')`};
  await db.exec(statements[blocker]);await expect(q(`SELECT cancel_partner_payment_contract('${c}','teste')`)).rejects.toThrow(/contrato_(com_pagamento|conciliado|em_encontro)/);
  expect((await roots(c)).length).toBe(1);
 });
 it('clears FKs before delete, cleans pending list/doc dependencies and creates 30-day trash',async()=>{
  const c=await create();const t=(await roots(c))[0].id;
  await db.exec(`INSERT INTO transaction_documents VALUES('${t}'); INSERT INTO reimbursement_notes VALUES('${t}');INSERT INTO reimbursement_note_items VALUES('${t}');
   WITH p AS(INSERT INTO payment_lists(status) VALUES('draft') RETURNING id) INSERT INTO payment_list_items(payment_list_id,transaction_id) SELECT id,'${t}' FROM p;`);
  await q(`SELECT cancel_partner_payment_contract('${c}','teste')`);expect((await roots(c)).length).toBe(0);
  expect((await q(`SELECT balance_tx_id,withholding_tx_id FROM partner_payment_contracts WHERE id='${c}'`))[0]).toEqual({balance_tx_id:null,withholding_tx_id:null});
  expect(Number((await q<{days:string}>(`SELECT extract(epoch FROM expires_at-deleted_at)/86400 AS days FROM trash`))[0].days)).toBe(30);
 });
 it('cancellation refuses paid attached advance',async()=>{const a=await advance(100,'paid');await db.exec(`UPDATE transactions SET paid_amount=100 WHERE id='${a}'`);const c=await create(1000,'false,NULL,NULL','NULL',`ARRAY['${a}'::uuid]`);await expect(q(`SELECT cancel_partner_payment_contract('${c}','teste')`)).rejects.toThrow('contrato_com_pagamento');});
 it('requires explicit beneficiary confirmation for advance',async()=>{const a=await advance();const c=await create();const b=(await q<{id:string}>(`INSERT INTO suppliers(company_id,name) VALUES('${company}','Outro') RETURNING id`))[0].id;await db.exec(`UPDATE partner_payment_contracts SET beneficiary_supplier_id='${b}' WHERE id='${c}'`);await expect(q(`SELECT attach_partner_advance_to_contract('${c}','${a}')`)).rejects.toThrow('beneficiario_diferente');await q(`SELECT attach_partner_advance_to_contract('${c}','${a}',true)`);});
 it('read status works after sealing, reports contracted/paid/missing/free',async()=>{const c=await create();await db.exec(`UPDATE transactions SET paid_amount=100 WHERE partner_contract_id='${c}';UPDATE event_settlements SET is_sealed=true`);const r=(await q<{s:Record<string,unknown>}>(`SELECT partner_contract_status('${participant}') s`))[0].s;expect(r).toMatchObject({share_amount:418598.65,contracted:1000,paid:100,missing:900,remaining:417598.65});});
 it('rejects mismatched settlement event',async()=>{await db.exec(`UPDATE event_settlements SET event_id=gen_random_uuid()`);await expect(create()).rejects.toThrow('fechamento_invalido');});
 it('exact advance exhaustion leaves zero balance without changing the advance',async()=>{const a=await advance(1000);const c=await create();await q(`SELECT attach_partner_advance_to_contract('${c}','${a}')`);expect((await roots(c)).map(t=>Number(t.amount))).toEqual([1000,0]);});
 it('paid advance is included once in paid status, not merely attached face value',async()=>{const a=await advance(100,'paid');await db.exec(`UPDATE transactions SET paid_amount=100 WHERE id='${a}'`);await create(1000,'false,NULL,NULL','NULL',`ARRAY['${a}'::uuid]`);const r=(await q<{s:Record<string,unknown>}>(`SELECT partner_contract_status('${participant}') s`))[0].s;expect(r).toMatchObject({contracted:1000,paid:100,missing:900});});
 it('external restrictive FK causes a clean refusal before deletion',async()=>{const c=await create();const t=(await roots(c))[0].id;await db.exec(`INSERT INTO ticket_office_statement_lines VALUES('${t}')`);await expect(q(`SELECT cancel_partner_payment_contract('${c}','teste')`)).rejects.toThrow('dependencia_externa');expect((await roots(c)).length).toBe(1);});
 it('wrong contract root cannot delete unrelated transaction',async()=>{const c=await create();const d=await create();const t=(await roots(d))[0].id;await db.exec(`UPDATE partner_payment_contracts SET balance_tx_id='${t}' WHERE id='${c}'`);await expect(q(`SELECT cancel_partner_payment_contract('${c}','teste')`)).rejects.toThrow('dependencia_inesperada');expect((await roots(d)).length).toBe(1);});
 it('attach refuses a balance in any non-rejected list',async()=>{const c=await create();const a=await advance();const t=(await roots(c))[0].id;await db.exec(`WITH p AS(INSERT INTO payment_lists(status) VALUES('draft') RETURNING id) INSERT INTO payment_list_items(payment_list_id,transaction_id) SELECT id,'${t}' FROM p`);await expect(q(`SELECT attach_partner_advance_to_contract('${c}','${a}')`)).rejects.toThrow('saldo_em_lista');});
 it('rollback removes only new functions and preserves contracts and transactions',async()=>{
  const c=await create();const rollback=readFileSync('supabase/manual/rollback_0273_p3_partner_contract_rpcs.sql','utf8').split('\n').filter(x=>x.startsWith('-- DROP FUNCTION ')).map(x=>x.slice(3)).join('\n');
  await db.exec('BEGIN;');try{await db.exec(rollback);expect((await q<{c:number}>(`SELECT count(*)::int c FROM pg_proc WHERE proname='create_partner_payment_contract'`))[0].c).toBe(0);expect((await roots(c)).length).toBe(1);}finally{await db.exec('ROLLBACK;');}
 });
 it('keeps result Anitta 760576.69 and frozen share 418598.65 untouched',async()=>{await create();expect((await q(`SELECT result::text FROM events`))[0].result).toBe('760576.69');expect((await q(`SELECT frozen_values->>'share_amount' share FROM event_settlement_participants`))[0].share).toBe('418598.65');});
 it('ACL security definer fixed path; anon denied, helpers private despite hosted default grants',async()=>{
  const rows=await q<{proname:string;prosecdef:boolean;proconfig:string[];a:boolean;r:boolean;s:boolean}>(`SELECT proname,prosecdef,proconfig,has_function_privilege('anon',p.oid,'EXECUTE') a,has_function_privilege('authenticated',p.oid,'EXECUTE') r,has_function_privilege('service_role',p.oid,'EXECUTE') s FROM pg_proc p WHERE proname IN('create_partner_payment_contract','update_partner_payment_contract','cancel_partner_payment_contract','attach_partner_advance_to_contract','partner_contract_status','_partner_contract_share','_partner_contract_advance','_partner_contract_assert_unpaid')`);
  expect(rows).toHaveLength(8);for(const r of rows){expect(r.prosecdef).toBe(true);expect(r.proconfig).toEqual(['search_path=public']);expect(r.a).toBe(false);expect(r.r).toBe(!r.proname.startsWith('_'));expect(r.s).toBe(!r.proname.startsWith('_'));}
 });
});
