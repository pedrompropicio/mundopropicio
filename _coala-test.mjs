import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, readFileSync } from "node:fs";

const URL = process.env.VITE_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_USER = "d8e502f7-9ceb-4dae-bd73-7291832d0d6f";
const EVENT_ID = "11111111-aaaa-bbbb-cccc-000000000001";

const admin = createClient(URL, SRK);

// 1) Build synthetic Coala XLSX (V13 layout)
// Headers row (matrix[1])
const headers = [
  "CC base","Formalidade","Centro Custo","Descrição","Valor Total s/ IVA","IVA",
  "Status PGT","Valor Pago s/ IVA","Valor IVA","Total","Data PGT","Data Fluxo",
  "Nome Empresa","Nº Fatura","Pago Via BR/PT"
];

// Row 0 = totals (we leave nulls so validation passes; parser only checks if present)
const totalsRow = new Array(headers.length).fill(null);

// Test rows — cobrir todos os casos
const rows = [
  // 1) PAGO PT, fornecedor novo, IVA 23, com data
  ["A","Fechado","Cachês","Caché Banda XPTO",1000,230,"Pago",1000,230,1230,new Date(2026,2,15),new Date(2026,2,20),"banda xpto lda","FT 2026/001","Pago PT"],
  // 2) PARCIAL, fornecedor novo lowercase → deve virar UPPER
  ["A","Negociado","Som/Luz/Led/Ecran","Sonorização Festival",2000,460,"Parcial",500,115,615,new Date(2026,3,1),new Date(2026,4,30),"audio pro unipessoal","",null],
  // 3) PENDENTE
  ["A","Estimado","Geradores","Aluguer geradores 200kVA",1500,345,"Pendente",0,0,0,null,new Date(2026,4,15),"GENPOWER, S.A.","",null],
  // 4) A&B excluído (deve ser ignorado na importação)
  ["A","Fechado","Bebida","Compra cervejas",500,30,"Pago",500,30,530,new Date(2026,2,10),new Date(2026,2,10),"distrib bebidas","",null],
  // 5) Sem CC → fallback 0.0.99
  ["A","Cotação","",  "Despesa misteriosa",100,6,"Pendente",0,0,0,null,null,"FORNECEDOR DESCONHECIDO","",null],
  // 6) IVA não-standard (snap 22→23)
  ["A","Fechado","DJs","Pagamento DJ Convidado",1000,220,"Pago",1000,220,1220,new Date(2026,2,18),new Date(2026,2,20),"dj convidado lda","REC 99","Pago PT"],
  // 7) BR (paid via BR) — pago pelo sócio
  ["A","Fechado","Hospedagem","Hotel artistas BR",800,0,"Pago",800,0,800,new Date(2026,2,1),new Date(2026,2,3),"hotel ipanema","INV-BR-001","Pago BR"],
  // 8) Fornecedor já existe (mesmo nome em CAIXA ALTA não deve duplicar)
  // — vamos pré-criar "BANDA XPTO LDA" antes de chamar para testar
  ["A","Fechado","Cachês","Caché Banda XPTO 2",500,115,"Pago",500,115,615,new Date(2026,2,16),new Date(2026,2,21),"BANDA XPTO LDA","FT 2026/002","Pago PT"],
  // 9) Sem data PGT e status pago → deve usar HOJE
  ["A","Fechado","Vedações","Vedações Heras",300,69,"Pago",300,69,369,null,new Date(2026,3,5),"VEDA-PT","",null],
  // 10) Data Fluxo em intervalo (string)
  ["A","Estimado","Sanitários / WC","WC químicos",400,92,"Pendente",0,0,0,null,"15/05 - 30/05","sanitec","",null],
  // 11) Formalidade ambígua
  ["A","??????","Tendas","Tendas backstage",700,161,"Pendente",0,0,0,null,new Date(2026,4,20),"TENDAS PT","",null],
];

const matrix = [totalsRow, headers, ...rows];
const ws = XLSX.utils.aoa_to_sheet(matrix);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Base Custos");

// Pipe sheet (sponsors)
const pipeMatrix = [
  ["Status","Patrocinador","2026 - Confirmados","2026 - Pipe","2026 - Propostas"],
  ["Confirmado","Marca Aurora",10000,0,0],
  ["Em negociação","Banco Beta",0,5000,0],
  ["Proposta enviada","Cerveja Gamma",0,0,15000],
];
const pws = XLSX.utils.aoa_to_sheet(pipeMatrix);
XLSX.utils.book_append_sheet(wb, pws, "Pipe");

const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync("/tmp/coala-test.xlsx", buf);
console.log("XLSX written:", buf.length, "bytes");

// Pre-create supplier "BANDA XPTO LDA" to test dedup
await admin.from("suppliers").upsert({
  name: "BANDA XPTO LDA",
  company_id: "975254b9-6b92-4cdd-a971-36e4a4f98525",
  is_active: true,
}, { onConflict: "company_id,name" });
console.log("Pre-created supplier BANDA XPTO LDA");

// Get JWT for admin user
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: (await admin.auth.admin.getUserById(ADMIN_USER)).data.user.email,
});
if (linkErr) console.error("link err:", linkErr);

// Use service role to mint a session via signInWithPassword? — easier: use service role to call edge function with custom Authorization
// Edge function uses createClient with user auth header to call auth.getUser(). With service role key, getUser() returns null user.
// Workaround: use admin.auth.admin.createSession or generate access token via signInWithIdToken... not available.
// Best: use exchangeCodeForSession via magic link. But simpler: call edge fn with service role key and skip user check by impersonating.
// Cleanest: use admin createUser + signInWithPassword. Reset password for admin user temporarily? Risky.
// Alternative: use generateLink hashed_token to get session via verifyOtp:
const { hashed_token } = linkData?.properties ?? {};
const userClient = createClient(URL, ANON);
const { data: sess, error: sessErr } = await userClient.auth.verifyOtp({
  type: "magiclink",
  token_hash: hashed_token,
});
if (sessErr) { console.error("verifyOtp err:", sessErr); process.exit(1); }
const accessToken = sess.session.access_token;
console.log("Got admin access token");

// Call edge function
const fileBase64 = buf.toString("base64");
const resp = await fetch(`${URL}/functions/v1/apply-coala-bp`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${accessToken}`,
    "apikey": ANON,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fileBase64,
    fileName: "coala-test.xlsx",
    fileVersion: "V13-TEST",
    eventId: EVENT_ID,
    syncMode: "replace",
    ackTotals: true,
    phase: "apply",
  }),
});
const result = await resp.json();
console.log("STATUS:", resp.status);
writeFileSync("/tmp/coala-result.json", JSON.stringify(result, null, 2));
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(result.summary ?? result, null, 2));
