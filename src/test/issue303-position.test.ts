// @vitest-environment node
// Catálogo e bytes exclusivamente sintéticos em PGlite, sem rede/credenciais.
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

export const read = (path: string) => readFileSync(path,"utf8");
export const migration = read("drizzle/migrations/0347_issue303_chain_position.sql");
export const rollback = read("supabase/manual/rollback_0347_issue303_chain_position_comentado.sql");
export const uid = (n: number) => `30303470-0000-4000-8000-${String(n).padStart(12,"0")}`;
export const C=uid(1), B=uid(2), U=uid(3), MANAGER=uid(4), PLATFORM=uid(5), A=uid(6), OFF=uid(7), FOREIGN=uid(8), EVENT=uid(9), FOREIGN_EVENT=uid(10);
let seq=100;
export const id=()=>uid(++seq);
export const q = (x: unknown): string => x == null ? "NULL" : typeof x === "number" || typeof x === "boolean" ? String(x) : `'${String(x).replaceAll("'","''")}'`;
export const json=(x: unknown)=>`${q(JSON.stringify(x))}::jsonb`;
const insert=(table: string,row: Record<string,unknown>)=>`INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(q).join(",")})`;
export type Line=Record<string,unknown>;
export type Saved={statement_id:string;revision:number};
type Options={lines?:Line[];total?:number;date?:string;account?:string;predecessor?:string;evidence?:Line;withCutoffEvidence?:boolean};
export type Proof={validator:string;position_cutoff_at:string;position_timezone:string;position_cutoff_source:string;pdf_timezone:string|null;independent_position:number;components:Record<string,number>;sources:Array<Record<string,unknown>>};
export type Receipt={position_proof:Proof;independent_position:number;opening_approved:boolean;confirmed_at:string};
export const sales=(index=0,cents=10000):Line=>({id:id(),document_line_type:"event_sales",description:"Quota sintética",amount_cents:cents,
  event_id:uid(1000+index),ticket_office_settlement_id:uid(2000+index),event_gross_cents:cents,event_retained_cents:0,declared_event_net_cents:cents});
export const opening=(cents=-1000):Line=>({id:id(),document_line_type:"opening_balance",description:"Base sintética",amount_cents:cents,opening_note:"Base manual revista, exclusivamente sintética"});
export const carry=(predecessor:string,cents:number):Line=>({id:id(),document_line_type:"carry_over",description:"Transitado sintético",previous_statement_id:predecessor,amount_cents:cents});
export const confirmSql=(s:Saved,approve=false)=>`SELECT public.confirm_ticket_office_statement(${q(s.statement_id)},${s.revision},${approve})`;

// Exportada apenas para o segundo teste autorizado; os testes abaixo só se registam
// quando este é o ficheiro recolhido pelo Vitest, sem duplicar hooks/suites ao importar.
export class PositionHarness {
  db!:PGlite;
  hasR4=false;
  async value<T=unknown>(sql:string):Promise<T> {return Object.values((await this.db.query<Record<string,T>>(sql)).rows[0])[0];}
  async owner(){await this.db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE");}
  async actor(user=U,company=C,role="authenticated"){
    await this.owner(); await this.db.exec(`SELECT set_config('test.uid',${q(user)},false),set_config('test.company',${q(company)},false); SET SESSION AUTHORIZATION ${role}`);
  }
  async fails(sql:string,message:string,code?:string){
    await this.db.exec("SAVEPOINT expected_failure");
    try {await expect(this.db.exec(sql)).rejects.toMatchObject({message:expect.stringContaining(message),...(code?{code}:{})});}
    finally {await this.db.exec("ROLLBACK TO expected_failure; RELEASE SAVEPOINT expected_failure");}
  }
  async init(install=true){
    this.hasR4=install;
    this.db=new PGlite();
    await this.db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TYPE app_role AS ENUM ('admin','manager','platform_admin','viewer');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.company',true),'')::uuid $$;
    CREATE TABLE user_roles(user_id uuid,company_id uuid,role app_role);
    INSERT INTO user_roles VALUES ('${U}','${C}','admin'),('${U}','${B}','admin'),('${MANAGER}','${C}','manager'),('${PLATFORM}','${C}','platform_admin');
    CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role='platform_admin') $$;
    CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT is_platform_admin($1) OR EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND company_id=current_company_id() AND role=$2) $$;
    CREATE FUNCTION has_staff_role(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
    CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=current_company_id() $$;
    CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
    CREATE FUNCTION set_company_id_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.company_id:=current_company_id(); RETURN NEW; END $$;
    CREATE TABLE companies(id uuid PRIMARY KEY,slug text,timezone text DEFAULT 'Europe/Lisbon');
    CREATE TABLE financial_accounts(id uuid PRIMARY KEY,company_id uuid REFERENCES companies,type text);
    CREATE TABLE events(id uuid PRIMARY KEY,company_id uuid REFERENCES companies);
    CREATE TABLE event_ticket_office_assignments(event_id uuid,financial_account_id uuid);
    CREATE TABLE account_categories(id uuid PRIMARY KEY,company_id uuid,code text);
    CREATE TABLE transactions(id uuid PRIMARY KEY,company_id uuid,account_id uuid,event_id uuid,invoice_group_id uuid,
      amount numeric(14,2),paid_amount numeric(14,2),type text,status text,currency text,category_id uuid,reversed_at timestamptz,settlement_id uuid,is_hidden boolean DEFAULT false,payment_date date,iban_override text DEFAULT 'SYNTHETIC-PRIVATE-IBAN');
    CREATE TABLE transaction_payments(id uuid PRIMARY KEY,transaction_id uuid REFERENCES transactions,amount numeric,company_id uuid,account_id uuid,currency text DEFAULT 'EUR',status text DEFAULT 'paid',payment_date date,reversed_at timestamptz,notes text DEFAULT 'SYNTHETIC-PRIVATE-NOTE');
    CREATE TABLE transaction_documents(id uuid PRIMARY KEY,transaction_id uuid REFERENCES transactions,file_url text);
    CREATE TABLE ticket_office_settlements(id uuid PRIMARY KEY,company_id uuid,financial_account_id uuid,event_id uuid,status text,net_calculated numeric,net_adjusted numeric,adjustment_notes text,closed_at timestamptz,settlement_date date);
    CREATE TABLE event_ticket_office_advances(id uuid PRIMARY KEY);
    CREATE TABLE storage_deletion_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket text,object_path text);
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text,metadata jsonb,UNIQUE(bucket_id,name));
    INSERT INTO companies(id,slug) VALUES ('${C}','synthetic-a'),('${B}','synthetic-b');
    INSERT INTO auth.users VALUES ('${U}'),('${MANAGER}'),('${PLATFORM}');
    INSERT INTO financial_accounts VALUES ('${A}','${C}','ticket_office'),('${OFF}','${C}','ticket_office'),('${FOREIGN}','${B}','ticket_office');
    INSERT INTO events VALUES ('${EVENT}','${C}'),('${FOREIGN_EVENT}','${B}');
    INSERT INTO event_ticket_office_assignments VALUES ('${EVENT}','${A}'),('${EVENT}','${OFF}'),('${FOREIGN_EVENT}','${FOREIGN}');
    INSERT INTO account_categories VALUES ('${uid(11)}','${C}','10.3');
    SELECT set_config('test.uid','${U}',false),set_config('test.company','${C}',false);`);
    await this.db.exec(read("supabase/migrations/20260516044247_d211f8c9-7cc0-4917-b04e-eb8d4a66796d.sql").split("-- Seed")[0]);
    for(const path of ["0077_derp231_ticket_office_statements","0090_ticket_office_statement_documents","0213_issue333_tosl_guard","0345_issue303_apuramento_contract","0346_issue303_commands"])
      await this.db.exec(read(`drizzle/migrations/${path}.sql`));
    await this.db.exec(`GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon,service_role;
      GRANT SELECT ON companies,financial_accounts,events TO authenticated;
      GRANT ALL ON company_features TO authenticated,service_role;
      GRANT ALL ON storage.objects,transactions,transaction_payments,transaction_documents,ticket_office_settlements TO authenticated,service_role;`);
    if(install) await this.db.exec(migration);
  }
  async begin(){
    await this.owner();await this.db.exec("BEGIN");
    // Fontes canónicas preexistentes, carregadas antes da activação sintética.
    for(let i=0;i<8;i++){
      await this.db.exec(insert("events",{id:uid(1000+i),company_id:C}));
      await this.db.exec(`INSERT INTO event_ticket_office_assignments VALUES (${q(uid(1000+i))},${q(A)}),(${q(uid(1000+i))},${q(OFF)})`);
      await this.db.exec(insert("ticket_office_settlements",{id:uid(2000+i),company_id:C,financial_account_id:A,event_id:uid(1000+i),status:i===0?"confirmed":"draft",
        net_calculated:100,closed_at:"2026-01-01T10:00:00Z",settlement_date:"2026-01-01"}));
    }
    await this.actor();
  }
  async end(){await this.db.exec("ROLLBACK");await this.owner();}
  async prepareRights(indexes:number[]){
    await this.owner();
    expect(await this.value("SELECT count(*)::int FROM company_features")).toBe(0);
    await this.db.exec(`UPDATE ticket_office_settlements SET status='confirmed' WHERE id IN (${indexes.map(i=>q(uid(2000+i))).join(",")})`);
    await this.actor();
  }
  async enable(accounts=[A]){
    await this.owner();
    await this.db.exec(`INSERT INTO company_features(company_id,feature_key,enabled,config)
      VALUES (${q(C)},'ticket-office-statements-v2',true,${json({accounts:accounts.map(financial_account_id=>({financial_account_id,enabled:true,contract_version:2}))})});
      UPDATE company_features SET enabled=true WHERE company_id=${q(C)} AND feature_key='ticket-office-statements-v2'`);
    await this.actor();
  }
  async draft(options:Options={}){
    const {lines=[sales()],date="2026-10-01",account=A,predecessor,evidence}=options;
    const total=options.total??lines.reduce((sum,l)=>sum+Number(l.amount_cents),0);
    await this.owner();
    if(!await this.value("SELECT EXISTS(SELECT 1 FROM company_features WHERE feature_key='ticket-office-statements-v2')")) await this.enable();
    await this.actor();
    const base={financial_account_id:account,number:`Synthetic-${id()}`,statement_date:date,document_total_cents:0,lines:[],documents:[]};
    const save=(payload:unknown,s?:Saved)=>`SELECT save_ticket_office_statement_draft(${s?q(s.statement_id):"NULL"},${s?.revision??0},${json(payload)})`;
    let s=await this.value<Saved>(save(base));
    await this.owner();
    const vid=id(),obj=id(),did=id(),path=`${C}/statements/${s.statement_id}/${vid}.pdf`;
    const bytes=`%PDF-1.7\nSYNTHETIC ${vid}\n%%EOF`,hash=createHash("sha256").update(bytes).digest("hex");
    await this.db.exec(insert("storage.objects",{id:obj,bucket_id:"ticket-office-settlements",name:path,metadata:"{}"}));
    await this.db.exec(`INSERT INTO issue303_private.verified_files(id,company_id,bucket_id,file_path,storage_object_id,bytes)
      VALUES (${q(vid)},${q(C)},'ticket-office-settlements',${q(path)},${q(obj)},convert_to(${q(bytes)},'UTF8'))`);
    if(this.hasR4 && options.withCutoffEvidence!==false) await this.db.exec(insert("issue303_private.position_evidence",{verified_file_id:vid,document_page:1,document_ref:"Conferência sintética dos bytes: data/hora e recebimentos",...evidence}));
    const payload={...base,document_total_cents:total,predecessor_statement_id:predecessor,
      documents:[{id:did,verified_file_id:vid,file_name:"synthetic.pdf",mime_type:"application/pdf",document_source:"apuramento"}],primary_document_id:did,
      lines:lines.map((l,position)=>({...l,position,source_sha256:hash,document_page:1,document_line_ref:`L${position+1}`}))};
    await this.actor();s=await this.value<Saved>(save(payload,s));
    return {s,vid,payload,saveSql:()=>save(payload,s)};
  }
  async confirm(s:Saved,approve=false){return this.value<Receipt>(confirmSql(s,approve));}
  async advance(cents=1000,date="2026-09-30",overrides:Line={}){
    await this.owner(); const tid=id(),pid=id();
    await this.db.exec(insert("transactions",{id:tid,company_id:C,account_id:A,amount:cents/100,paid_amount:cents/100,type:"expense",status:"paid",currency:"EUR",category_id:uid(11),payment_date:date,...overrides}));
    await this.db.exec(insert("transaction_payments",{id:pid,transaction_id:tid,company_id:C,account_id:A,amount:cents/100,payment_date:date}));
    await this.actor();
    return {tid,pid,line:{id:id(),document_line_type:"advance",description:"Repasse sintético",amount_cents:-cents,transaction_id:tid} satisfies Line};
  }
  async timezone(zone:string|null){await this.owner();await this.db.exec(`UPDATE companies SET timezone=${q(zone)} WHERE id=${q(C)}`);await this.actor();}
  async snapshot(){await this.owner();return this.value(`SELECT jsonb_build_object('transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t),
    'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM transaction_payments p),
    'settlements',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM ticket_office_settlements c))`);}
}

if(fileURLToPath(import.meta.url)===expect.getState().testPath) describe("#303 / 0347 — corte, cadeia e posição independente",()=>{
  const h=new PositionHarness();
  beforeAll(()=>h.init(),30000);
  afterAll(async()=>{await h.db?.close();});
  beforeEach(()=>h.begin());afterEach(()=>h.end());

  it("duas cópias byte a byte, cabeçalho inerte, ACL privadas e ausência de DML operacional",async()=>{
    expect(read("supabase/manual/0347_issue303_chain_position.sql")).toBe(migration);
    expect(migration).toContain("PREPARADA, NÃO APLICADA");
    expect(rollback.split("\n").filter(l=>l.trim()).every(l=>l.startsWith("--"))).toBe(true);
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\./i);
    await h.owner();
    for(const role of ["anon","authenticated","service_role"]){
      expect(await h.value(`SELECT has_function_privilege(${q(role)},'issue303_private.r4_validate(uuid,bigint)','EXECUTE')`)).toBe(false);
      expect(await h.value(`SELECT has_table_privilege(${q(role)},'issue303_private.position_evidence','SELECT,INSERT,UPDATE,DELETE')`)).toBe(false);
      expect(await h.value(`SELECT has_table_privilege(${q(role)},'issue303_private.receipt_sources','SELECT,INSERT,UPDATE,DELETE')`)).toBe(false);
    }
    expect(await h.value("SELECT count(*)::int FROM company_features")).toBe(0);
  });

  it.each([
    ["Europe/Lisbon","2026-03-28","2026-03-29T00:00:00Z"],
    ["Europe/Lisbon","2026-03-29","2026-03-29T23:00:00Z"],
    ["Europe/Lisbon","2026-10-24","2026-10-24T23:00:00Z"],
    ["Europe/Lisbon","2026-10-25","2026-10-26T00:00:00Z"],
    ["America/Sao_Paulo","2026-03-28","2026-03-29T03:00:00Z"],
    ["America/Sao_Paulo","2026-03-29","2026-03-30T03:00:00Z"],
    ["America/Sao_Paulo","2026-10-24","2026-10-25T03:00:00Z"],
    ["America/Sao_Paulo","2026-10-25","2026-10-26T03:00:00Z"],
    ["America/Sao_Paulo","2026-12-31","2027-01-01T03:00:00Z"],
  ])("corte civil exclusivo %s / %s = %s",async(zone,date,expected)=>{
    await h.timezone(zone);const {s}=await h.draft({date,lines:[opening(0)]});
    await h.db.exec("SET TIME ZONE 'Pacific/Auckland'");
    const r=await h.confirm(s,true),p=r.position_proof;
    expect(new Date(p.position_cutoff_at).toISOString()).toBe(new Date(expected).toISOString());
    expect(p.position_timezone).toBe(zone);expect(p.position_cutoff_source).toBe("company_day_end");
    await h.timezone("UTC");await h.actor();expect(await h.confirm(s,true)).toEqual(r);
    await h.db.exec("SET TIME ZONE 'UTC'");
  });

  it.each([
    ["Europe/Lisbon",null,"2026-10-01T11:30:00Z"],
    ["America/Sao_Paulo",null,"2026-10-01T15:30:00Z"],
    ["Europe/Lisbon","-03:00","2026-10-01T15:30:00Z"],
    ["America/Sao_Paulo","+02:00","2026-10-01T10:30:00Z"],
    ["America/Sao_Paulo","Europe/Lisbon","2026-10-01T11:30:00Z"],
  ])("hora PDF prevalece: empresa %s, fuso PDF %s",async(zone,pdf_timezone,expected)=>{
    await h.timezone(zone);const {s}=await h.draft({evidence:{pdf_local_at:"2026-10-01 12:30:00",pdf_timezone}});
    const p=(await h.confirm(s)).position_proof;
    expect(new Date(p.position_cutoff_at).toISOString()).toBe(new Date(expected).toISOString());
    expect(p.position_cutoff_source).toBe("pdf_explicit");expect(p.position_timezone).toBe(zone);
  });

  it.each([null,"","Invalid/Synthetic","+03:00"])("recusa fuso da empresa ausente/inválido: %j",async zone=>{
    await h.timezone(zone);const {s}=await h.draft();await h.fails(confirmSql(s),zone===null||zone===""?"company_timezone_missing":"company_timezone_invalid");
  });

  it("não confunde ausência de extracção verificada com PDF só com data",async()=>{
    const {s}=await h.draft({withCutoffEvidence:false});await h.fails(confirmSql(s),"position_cutoff_evidence_required");
  });

  it.each([
    ["2026-03-29","2026-03-29 01:30:00",null,"timezone_ambiguous"],
    ["2026-10-25","2026-10-25 01:30:00",null,"timezone_ambiguous"],
    ["2026-10-25","2026-10-25 01:30:00","+14:01","timezone_invalid"],
    ["2026-10-25","2026-10-25 01:30:00","Invalid/Zone","timezone_invalid"],
    ["2026-10-25","2026-10-24 12:30:00",null,"date_mismatch"],
  ])("hora PDF inválida/ambígua não escolhe instante: %s %s %s",async(date,pdf_local_at,pdf_timezone,reason)=>{
    const {s}=await h.draft({date,evidence:{pdf_local_at,pdf_timezone}});await h.fails(confirmSql(s),reason);
  });

  it("offset explícito desambigua a hora repetida de Outubro",async()=>{
    const {s}=await h.draft({date:"2026-10-25",evidence:{pdf_local_at:"2026-10-25 01:30:00",pdf_timezone:"+01:00"}});
    expect(new Date((await h.confirm(s)).position_proof.position_cutoff_at).toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it.each([-4000,0,4000])("primeiro documento admite abertura %i só com aprovação explícita",async amount=>{
    const {s}=await h.draft({lines:[opening(amount)]});
    await h.fails(confirmSql(s),"opening_first_admin_approval_required");
    const r=await h.confirm(s,true);expect(r.independent_position).toBe(amount/100);expect(r.opening_approved).toBe(true);
  });

  it("primeiro sem abertura usa as fontes independentes; não escreve finanças",async()=>{
    const a=await h.advance(2000);const {s}=await h.draft({lines:[sales(),a.line]});
    const before=await h.snapshot();await h.actor();const r=await h.confirm(s);
    expect(r.independent_position).toBe(80);expect(r.position_proof.components).toEqual({base:0,event_rights:100,adjustments:0,advances:20});
    expect(JSON.stringify(r)).not.toContain("SYNTHETIC-PRIVATE");
    expect(await h.snapshot()).toEqual(before);
  });

  it("quota inclui a dedução uma vez e acerto sem quota entra separadamente",async()=>{
    const quota=sales(0,12000);quota.declared_event_net_cents=10000;
    const deduction=await h.advance(2000,"2026-09-30",{event_id:uid(1000)});
    const adjustment=await h.advance(3000);
    const {s}=await h.draft({lines:[quota,
      {...deduction.line,document_line_type:"ticketline_invoice",event_id:uid(1000),quota_line_id:quota.id},
      {...adjustment.line,document_line_type:"ticketline_invoice"}]});
    const p=(await h.confirm(s)).position_proof;
    expect(p.independent_position).toBe(70);
    expect(p.components).toEqual({base:0,event_rights:100,adjustments:-30,advances:0});
    expect(p.sources.filter(x=>x.kind==="transaction")).toHaveLength(2);
  });

  it("grupo de factura expande movimentos concretos e conserva hashes dos pagamentos",async()=>{
    const group=id();
    const a=await h.advance(1000,"2026-09-30",{invoice_group_id:group});
    const b=await h.advance(2000,"2026-09-30",{invoice_group_id:group});
    const {s}=await h.draft({lines:[sales(),{id:id(),document_line_type:"ticketline_invoice",description:"Grupo sintético",
      amount_cents:-3000,invoice_group_id:group}]});
    const p=(await h.confirm(s)).position_proof;
    expect(p.independent_position).toBe(70);
    expect(p.sources.filter(x=>x.kind==="transaction").map(x=>x.transaction_id).sort()).toEqual([a.tid,b.tid].sort());
    for(const source of p.sources.filter(x=>x.kind==="transaction"))expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("acerto só documental sem fonte independente bloqueia a posição",async()=>{
    const {s}=await h.draft({lines:[sales(),{id:id(),document_line_type:"venue_settlement",description:"Acerto sintético",
      amount_cents:-1000,notes:"Documento sem movimento independente"}]});
    await h.fails(confirmSql(s),"position_source_missing");
  });

  it("depois do primeiro exige predecessor a zero e não renova abertura ao reactivar",async()=>{
    await h.prepareRights([1]);
    const first=await h.draft({lines:[opening(0)]});await h.confirm(first.s,true);
    const next=await h.draft({lines:[sales(1)],date:"2026-10-02"});
    await h.fails(confirmSql(next.s),"chain_predecessor_required");
    const extra=await h.draft({lines:[opening(1)],date:"2026-10-02"});await h.fails(confirmSql(extra.s,true),"opening_first_admin_approval_required");
    await h.owner();await h.db.exec("UPDATE company_features SET enabled=false; UPDATE company_features SET enabled=true");
    await h.actor();await h.fails(confirmSql(next.s),"chain_predecessor_required");
    const valid=await h.draft({lines:[sales(1)],date:"2026-10-02",predecessor:first.s.statement_id});
    expect((await h.confirm(valid.s)).independent_position).toBe(100);
  });

  it.each([-3999,-4001,4000])("carry_over %i diverge do predecessor em aberto",async amount=>{
    const first=await h.draft({lines:[opening(-4000)]});await h.confirm(first.s,true);
    const next=await h.draft({lines:[carry(first.s.statement_id,amount)],date:"2026-10-02",predecessor:first.s.statement_id});
    await h.fails(confirmSql(next.s),"chain_carry_mismatch");
  });

  it("transporta o negativo por dois sucessores sem voltar a somar os saldos antigos",async()=>{
    await h.prepareRights([1,2]);
    const first=await h.draft({lines:[opening(-40000)]});await h.confirm(first.s,true);
    const next=await h.draft({lines:[carry(first.s.statement_id,-40000),sales(1)],date:"2026-10-02",predecessor:first.s.statement_id});
    expect((await h.confirm(next.s)).independent_position).toBe(-300);
    const third=await h.draft({lines:[carry(next.s.statement_id,-30000),sales(2)],date:"2026-10-03",predecessor:next.s.statement_id});
    expect((await h.confirm(third.s)).independent_position).toBe(-200);
  });

  it("corte invertido recusa sem confirmar o sucessor",async()=>{
    const first=await h.draft({lines:[opening(0)]});await h.confirm(first.s,true);
    const bad=await h.draft({lines:[sales()],predecessor:first.s.statement_id});await h.fails(confirmSql(bad.s),"chain_cutoff_order");
    await h.owner();expect(await h.value(`SELECT status FROM ticket_office_statements WHERE id=${q(bad.s.statement_id)}`)).toBe("draft");
  });

  it("histórico confirmado sem base documentada não se torna abertura",async()=>{
    await h.actor();const historic=id();
    await h.db.exec(insert("ticket_office_statements",{id:historic,company_id:C,financial_account_id:A,number:"Legacy",statement_date:"2026-09-01",document_total:0,status:"confirmed"}));
    const {s}=await h.draft({predecessor:historic});await h.fails(confirmSql(s),"chain_documented_base_required");
  });

  it("resíduo de um cêntimo não é preenchido pela soma declarada",async()=>{
    const {s}=await h.draft({lines:[sales(0,10001)]});await h.fails(confirmSql(s),"position_event_residue");
    await h.owner();expect(await h.value(`SELECT status FROM ticket_office_statements WHERE id=${q(s.statement_id)}`)).toBe("draft");
    expect(await h.value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(0);
  });

  it("repasse omitido bloqueia mesmo que as linhas escolhidas coincidam com o total declarado",async()=>{
    await h.advance(2500);const {s}=await h.draft();
    await h.fails(confirmSql(s),"position_unexplained_advance");
  });

  it("data actual do cabeçalho não esconde pagamento anterior omitido",async()=>{
    const a=await h.advance(2500);await h.owner();
    await h.db.exec(`UPDATE transactions SET payment_date='2026-10-02' WHERE id=${q(a.tid)}`);
    const {s}=await h.draft();await h.fails(confirmSql(s),"position_unexplained_advance");
  });

  it("histórico de direitos sem base documentada nem abertura não é saldo zero implícito",async()=>{
    await h.prepareRights([1]);
    await h.owner();await h.db.exec(`UPDATE ticket_office_settlements SET closed_at='2026-09-01T12:00:00Z' WHERE id=${q(uid(2001))}`);
    const {s}=await h.draft();await h.fails(confirmSql(s),"position_unexplained_event");
  });

  it("um repasse fora das linhas do sucessor não desaparece por existir predecessor a zero",async()=>{
    await h.prepareRights([1]);
    const root=await h.draft({lines:[opening(0)]});await h.confirm(root.s,true);
    await h.advance(2500,"2026-10-02");
    const next=await h.draft({lines:[sales(1)],date:"2026-10-02",predecessor:root.s.statement_id});
    await h.fails(confirmSql(next.s),"position_unexplained_advance");
  });

  it("abertura manual não permite voltar a subtrair repasse do histórico num sucessor",async()=>{
    const historic=await h.advance(1000,"2026-09-30");
    const root=await h.draft({lines:[opening(-4000)]});await h.confirm(root.s,true);
    const next=await h.draft({lines:[carry(root.s.statement_id,-4000),historic.line],date:"2026-10-02",predecessor:root.s.statement_id});
    await h.fails(confirmSql(next.s),"position_advance_before_predecessor");
  });

  it("evento sem fecho independente recusa mesmo quando as linhas batem com o PDF",async()=>{
    const {s}=await h.draft({lines:[{...sales(),ticket_office_settlement_id:null}]});await h.fails(confirmSql(s),"position_event_source_required");
  });

  it("exclui fonte de evento no instante exacto do corte",async()=>{
    await h.owner();await h.db.exec(`UPDATE ticket_office_settlements SET closed_at='2026-10-01T23:00:00Z' WHERE id=${q(uid(2000))}`);
    const {s}=await h.draft();await h.fails(confirmSql(s),"position_event_source_required");
  });

  it("não retroage pagamento posterior nem inventa a hora num dia parcialmente coberto",async()=>{
    const a=await h.advance(1000,"2026-10-02");const {s}=await h.draft({lines:[sales(),a.line]});await h.fails(confirmSql(s),"dated_source_required");
    const b=await h.advance(1000,"2026-10-01");const second=await h.draft({lines:[sales(),b.line],evidence:{pdf_local_at:"2026-10-01 12:00:00"}});
    await h.fails(confirmSql(second.s),"dated_source_required");
  });

  it("paid_amount sem pagamentos datados ou com resíduo não prova posição histórica",async()=>{
    const a=await h.advance();const {s}=await h.draft({lines:[sales(),a.line]});await h.owner();
    await h.db.exec(`UPDATE transaction_payments SET amount=9.99 WHERE id=${q(a.pid)}`);await h.actor();await h.fails(confirmSql(s),"payment_residue");
    await h.owner();await h.db.exec(`DELETE FROM transaction_payments WHERE id=${q(a.pid)}`);await h.actor();await h.fails(confirmSql(s),"dated_source_required");
  });

  it("saldo positivo exige prova independente dos recebimentos e aceita carry não recebido",async()=>{
    const first=await h.draft({lines:[opening(4000)]});await h.confirm(first.s,true);
    await h.db.exec("SAVEPOINT incomplete_receipts");
    const next=await h.draft({lines:[carry(first.s.statement_id,4000)],date:"2026-10-02",predecessor:first.s.statement_id});
    await h.fails(confirmSql(next.s),"positive_outstanding_proof_required");
    await h.db.exec("ROLLBACK TO incomplete_receipts; RELEASE SAVEPOINT incomplete_receipts");
    const complete=await h.draft({lines:[carry(first.s.statement_id,4000)],date:"2026-10-02",predecessor:first.s.statement_id,evidence:{receipts_complete:true}});
    expect((await h.confirm(complete.s)).independent_position).toBe(40);
  });

  it("recebimento datado abate o positivo uma vez e não se transforma em advance repetido",async()=>{
    const first=await h.draft({lines:[opening(4000)]});await h.confirm(first.s,true);
    const group=id(),received=await h.advance(1000,"2026-10-02",{invoice_group_id:group});
    const next=await h.draft({lines:[carry(first.s.statement_id,3000)],date:"2026-10-03",predecessor:first.s.statement_id,evidence:{receipts_complete:true}});
    await h.owner();await h.db.exec(insert("issue303_private.receipt_sources",{transaction_id:received.tid,verified_file_id:next.vid,predecessor_statement_id:first.s.statement_id}));
    await h.actor();const r=await h.confirm(next.s);expect(r.independent_position).toBe(30);expect(r.position_proof.components.advances).toBe(0);
    await h.owner();await h.fails(`UPDATE transactions SET paid_amount=0 WHERE id=${q(received.tid)}`,"receipt_source_frozen");
    await h.fails(`UPDATE transaction_payments SET amount=1 WHERE id=${q(received.pid)}`,"receipt_source_frozen");
    await h.actor();const legacy=id();
    await h.db.exec(insert("ticket_office_statements",{id:legacy,company_id:C,financial_account_id:OFF,number:"Legacy receipt reuse",statement_date:"2026-10-04"}));
    for(const reference of [{transaction_id:received.tid},{invoice_group_id:group}]){
      await h.fails(insert("ticket_office_statement_lines",{id:id(),statement_id:legacy,company_id:C,position:0,line_type:"ticketline_invoice",
        description:"Não reutilizar recebimento",amount:-10,...reference}),"receipt_source_frozen");
    }
  });

  it("positivo totalmente recebido exige predecessor e não reaparece como carry_over",async()=>{
    await h.prepareRights([1]);
    const first=await h.draft({lines:[opening(4000)]});await h.confirm(first.s,true);
    const received=await h.advance(4000,"2026-10-02");
    const next=await h.draft({lines:[sales(1)],date:"2026-10-03",predecessor:first.s.statement_id,evidence:{receipts_complete:true}});
    await h.owner();await h.db.exec(insert("issue303_private.receipt_sources",{transaction_id:received.tid,verified_file_id:next.vid,predecessor_statement_id:first.s.statement_id}));
    await h.actor();const p=(await h.confirm(next.s)).position_proof;
    expect(p.components.base).toBe(0);expect(p.independent_position).toBe(100);
  });

  it("pagamento anterior ao corte do predecessor não pode voltar a abater o carry",async()=>{
    const first=await h.draft({lines:[opening(4000)]});await h.confirm(first.s,true);
    const received=await h.advance(1000,"2026-09-30");
    const next=await h.draft({lines:[carry(first.s.statement_id,3000)],date:"2026-10-03",predecessor:first.s.statement_id,evidence:{receipts_complete:true}});
    await h.owner();await h.db.exec(insert("issue303_private.receipt_sources",{transaction_id:received.tid,verified_file_id:next.vid,predecessor_statement_id:first.s.statement_id}));
    await h.actor();await h.fails(confirmSql(next.s),"invalid_predecessor_receipt");
  });

  it("o mesmo recebimento não pode ser abatido no carry e em advance",async()=>{
    const first=await h.draft({lines:[opening(4000)]});await h.confirm(first.s,true);
    const received=await h.advance(1000,"2026-10-02");
    const next=await h.draft({lines:[carry(first.s.statement_id,3000),received.line],date:"2026-10-03",predecessor:first.s.statement_id,evidence:{receipts_complete:true}});
    await h.owner();await h.fails(insert("issue303_private.receipt_sources",{transaction_id:received.tid,verified_file_id:next.vid,predecessor_statement_id:first.s.statement_id}),"source_already_used");
    await h.actor();await h.fails(confirmSql(next.s),"chain_carry_mismatch");
  });

  it("conta desligada mantém cabeçalho/linhas/ACL/finanças legadas intactos",async()=>{
    await h.enable();await h.actor();const sid=id();
    await h.db.exec(insert("ticket_office_statements",{id:sid,company_id:C,financial_account_id:OFF,number:"Off",statement_date:"2026-10-01",document_total:0}));
    await h.owner();const before=await h.value(`SELECT to_jsonb(s) FROM ticket_office_statements s WHERE id=${q(sid)}`);
    const finance=await h.snapshot();await h.actor();const {s}=await h.draft();await h.confirm(s);
    await h.owner();expect(await h.value(`SELECT to_jsonb(s) FROM ticket_office_statements s WHERE id=${q(sid)}`)).toEqual(before);expect(await h.snapshot()).toEqual(finance);
    await h.actor();await h.fails(`SELECT save_ticket_office_statement_draft(NULL,0,${json({financial_account_id:OFF,number:"blocked",statement_date:"2026-10-01",document_total_cents:0,lines:[],documents:[]})})`,"account_not_enabled");
  });

  it("provas de corte são imutáveis e não se acrescentam depois da confirmação",async()=>{
    const {s,vid}=await h.draft({evidence:{pdf_local_at:"2026-10-01 12:00:00"}});await h.confirm(s);await h.owner();
    await h.fails(`UPDATE issue303_private.position_evidence SET pdf_local_at=NULL WHERE verified_file_id=${q(vid)}`,"append_only");
    // Os bytes confirmados também não permitem anexar um novo recebimento.
    await h.owner();await h.fails(insert("issue303_private.receipt_sources",{transaction_id:uid(9999),verified_file_id:vid,predecessor_statement_id:s.statement_id}),"evidence_frozen");
  });

  it("rollback só comentado é aplicável e repõe 0346 sem tocar no recibo confirmado",async()=>{
    const {s}=await h.draft();const receipt=await h.confirm(s);const next=await h.draft({lines:[sales(1)],date:"2026-10-02"});
    await h.owner();const finance=await h.snapshot();
    const sql=rollback.split("\n").map(l=>l.replace(/^-- ?/,"")).join("\n");
    // Dentro da transacção sintética, sem COMMIT que escapasse ao afterEach.
    await h.db.exec(sql.slice(sql.indexOf("BEGIN;")+6,sql.lastIndexOf("COMMIT;")));
    await h.actor();expect(await h.confirm(s)).toEqual(receipt);await h.fails(confirmSql(next.s),"capacidade_r4_em_falta","55000");
    expect(await h.snapshot()).toEqual(finance);
  });
});
