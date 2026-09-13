# Estado — Fecho, Fechamentos e Sócios (#146)

Actualizado em 2026-09-13 (fim da sessão g7→g17-d). **Publicado hoje pelo Pedro:**
g7, g9c, g10, g11, g12, g13, g13-b, g14; depois g15, g15-b, g15-c; e por fim g16
(seletor "Sócio" nos acessos de parceiros + lista na ficha do fornecedor) e
g17 / g17-b / g17-c / g17-d (edge function `partner-statement` com o gerador
único, bloco "O seu fechamento" no Portal, cards do evento, arredondamento único
`roundCents`).

## Em que pé está

O motor dos fechamentos, o Encontro de Contas, o documento do sócio, o relatório
interno e o Portal do Sócio estão em produção e todos dão os mesmos números. A
Anitta EDA 2026 corre a três níveis (raiz ANITTA → Fechamento Rafael Lobo →
Fechamento MP + EIN) com C1 e C2 a 0,00. A estanqueidade entre sócios está
provada no site publicado com utilizadores reais ligados. Falta a prova formal
contra a planilha v23, as devoluções ao Fechamento MP + EIN e selar.

### Publicado hoje

- **(g7)** "Recebido por (sócio)" em receitas por encontro de contas — quarta
  fonte de receitas em poder do sócio.
- **(g9c)** nominal nunca dá vista (`mode='settles'`), casa implícita mostra-se
  como MUNDO PROPÍCIO, documento sem vocabulário interno, cache por identidade.
- **(g10)** rótulo de base **efectiva**: um nó que devolve o IVA dedutível
  apresenta-se "Despesas s/IVA" / "Resultado s/IVA". Só apresentação.
- **(g11)** correcção do `select` `account_type` → `type`: as receitas em poder
  do sócio carregavam 0.
- **(g12)** botão "Ver detalhe" por sócio no Encontro de Contas — desembolso,
  transacções pagas pelo sócio, ajustes, receitas em poder, extras, e a conta por
  extenso com aviso quando não fecha.
- **(g13)** documento em cascata para fechamentos filhos: receitas e despesas
  sempre do perímetro da raiz; dedução dos sócios **acima pelo nome**; ao lado e
  abaixo nunca.
- **(g13-b)** a linha "+ IVA dedutível recuperado" é obrigatória na cascata (sem
  ela a conta não fecha); o aviso vermelho "a conta não fecha" mantém-se como
  guarda.
- **(g14)** `event_forecasts.vat_non_recoverable` com semântica de **custo real**:
  IVA pago e legalmente não dedutível sai da devolução e abate ao resultado real.
- **(g15)** **relatório interno do Encontro de Contas reformulado**: modelo puro
  `src/lib/partner-settlement-internal-report.ts` + gerador
  `src/lib/export-partner-settlement-internal-pdf.ts` (A4 retrato, cabeçalho e
  rodapé em todas as páginas, sem quebras forçadas, tabelas pequenas inteiras).
  Contém cascata até ao fechamento, distribuição, a linha g5 por sócio com os
  quadros de detalhe da g12, Posição da Mundo Propício e anexos (bilheteira e
  **anexo B na base do critério: 1.931.219,49**). Ficheiro
  `Fecho_<evento>_<fechamento>.pdf`.
- **(g15-b)** **nenhum cêntimo de diferença entre PDF e ecrã**: todos os totais
  vêm do SSoT (`partner-disbursement.ts`); as linhas itemizadas são só
  apresentação, reconciliadas em round-half-even. Teste falha se qualquer total
  do PDF divergir do modelo em ≥ 0,01. Base a transferir da EIN: **230.990,35**
  no PDF e no ecrã.
- **(g15-c)** **resumo geral da Mundo Propício** como primeira secção, com
  logótipo MP na 1.ª página e nome da empresa no cabeçalho corrente: resultado
  real do evento, "O que cada sócio leva de facto" (partes reais) e **líquido
  final da MP 297.798,68** decomposto (parte declarada 273.953,35 + diferença de
  posição nominal 23.845,34), com a prova C1 = 0 impressa. Na cascata, o
  participante nominal mostra o nominal (RAFAEL LOBO 10% · 59.613,35) e, em
  itálico, o real do fecho dele (20% de 30% = 35.768,01) e para onde vai a
  diferença — a mesma nota aparece no ecrã.
- **(g16)** ligação utilizador ↔ sócio deixou de ser SQL: seletor "Sócio" no
  cartão de acesso de parceiro e lista dos utilizadores ligados na ficha do
  fornecedor.
- **(g17 / g17-b / g17-c)** o Portal **não calcula** o fecho: pacote partilhado
  `supabase/functions/_shared/settlement/` + edge function `partner-statement`
  (`verify_jwt`, service_role) que valida utilizador, resolve o sócio por
  `user_supplier_id`, exige acesso ao evento e `mode='settles'` e devolve
  `{ doc, block, cards }`. Bloco "O seu fechamento" no topo e cards do evento com
  os números do fecho.
- **(g17-d)** **regra única de arredondamento**: `roundCents`
  (`_shared/settlement/iva.ts`) é a única função de arredondamento do fecho;
  `Math.round(x*100)/100`, `toFixed` e truncatura ficam proibidos em valores do
  fecho. A parte da ANITTA passa a **417.293,42** em motor, Encontro de Contas,
  relatório interno, documento e Portal.

### Prova real no Portal (site publicado, 13/09)

Login com o utilizador de teste `pedroneto@socialmusic.com.br`, ligado
sucessivamente a RAFAEL LOBO, EVERYTHINGISNEW e ANITTA:

- Cada sócio vê **só o seu fechamento**; nenhuma referência a outros sócios nem
  a outros fechamentos; troca de identidade sem cache suja.
- RAFAEL LOBO: 596.133,45 − ANITTA 70% = 178.840,04 → 20% = **35.768,01**.
- EVERYTHINGISNEW: cascata completa (119.226,69 + 262.459,85 + 72.250,52 +
  93.969,63 = 547.906,69), parte **273.953,34**, base a transferir
  **230.990,35**, receitas em poder itemizadas.
- ANITTA: "ANITTA 70% · Sócios locais 30%" → **417.293,42** (após g17-d).
- PDFs gerados do Portal para os três. O utilizador de teste foi devolvido a
  "sem sócio".
- Ligações reais: `lobo@vybbe.com.br` → RAFAEL LOBO,
  `taniatadeu@everythingisnew.pt` → EVERYTHINGISNEW, `marianna…` → ANITTA.

**P2-13 (re-auditoria de estanqueidade com utilizadores ligados) está FEITA** —
issue #168 a fechar com este resumo.

### Dados da Anitta já tratados (SQL autorizado)

- Oeiras e Bengaleiro na conta "Acerto EIN · Anitta EDA 2026", pagas, IVA 0 em
  Oeiras, descrições limpas.
- A&B Food com "Recebido por: EIN"; bares com "Resultado ficou com: EIN".
- Ajuste da SPA −34.304,72 (`disbursement_adjustment`, "diferença entre 5%
  orçamentado e 3,5% pago").
- `profiles.linked_supplier_id` ligado nos 3 sócios com utilizador.
- producaotec@mundopropicio.com com papel `producer` na Coala e na MP.
- Descrições do RS 1% Ticketline e do repasse de 905.000 limpas.
- **Nenhuma** linha com `vat_non_recoverable` (confirmado: 0) — o open bar NÃO se
  marca, o IVA negocial é ativo da sociedade.

## A trabalhar agora

1. Devoluções ao Fechamento MP + EIN: Advogado 3.000, Equipa de Produção EIN
   15.000 e ~3 linhas a identificar pelo Pedro.
2. Seis números da planilha v23 (prova formal) — o Pedro fornece.
3. Selar os 3 fechamentos.
4. Fechar a #146.

## Pendentes menores

- `suppliers.doc_locale` da ANITTA para `pt-BR` (DML do Pedro).
- ANITTA duplicada na empresa Coala (`d24f8f88…`) sem uso — decidir apagar.
- Descrições de linhas de BP com "· EIN" visíveis ao sócio (P2, a limpar).

## Bloqueios

- Prova v23 depende dos números do Pedro.

## Factos que não se reinvestigam

- Encontro de Contas, Fechamento MP + EIN (13/09): parte EIN **273.953,35** ·
  desembolso **1.170.562,18** · ajustes **−34.304,72** · receitas em poder
  **1.179.220,45** · financiamento a devolver **−42.962,99** · base a transferir
  **230.990,35**.
- Cascata da EIN: 596.133,45 − 417.293,42 (ANITTA 70%) − 59.613,35 (RAFAEL LOBO
  10%) = 119.226,69 + 262.459,85 (IVA dedutível recuperado) + 72.250,52
  (exclusivas) + 93.969,63 (operações de terceiros) = 547.906,69. RAFAEL LOBO
  178.840,04. ANITTA 417.293,42.
- Partes **reais**: ANITTA 417.293,42 · RAFAEL LOBO 35.768,01 (20% de 30%) ·
  EVERYTHINGISNEW 273.953,35; líquido final da MP **297.798,68**.
- IVA devolvido 262.459,85; nível 3 547.906,69; EIN 273.953,35; base de custo do
  critério 1.931.219,49.
- O cêntimo de diferença na raiz **deixou de existir** (g17-d): 417.293,42 em
  todo o lado.
- Políticas PERMISSIVE abertas são proibidas: padrão `privileged_roles` (staff)
  + política estanque de sócio.
- DRE Empresarial e DRE Brasil são vistas de EMPRESA e mantêm os exclusivos.
- Descrições de transações e de linhas de BP são texto de negócio.
- Testes: falhas pré-existentes e alheias a esta frente (`storage-multi-tenant`,
  `forecast-boost`, `EventABTab`).

## Fora desta frente

Para o chat **plataforma-e-infra**: a "email-sending update" do Lovable de 13/09
13:38 — remetente `notify.mpgestaoeventos.com`, cron de minuto a minuto,
`process-email-queue` a exigir sessão autenticada, 8 emails falhados.

## Onde ler mais

- `docs/handoffs/2026-09-13-fecho-e-socios-g7-g17.md` (arquivo da sessão)
- `docs/auditorias/AUD-estanqueidade-socios-2026-09-13.md`
- `.lovable/memory/features/partner-settlement.md`
- `.lovable/memory/features/event-settlements.md`
- `docs/DECISIONS.md` (adendas g4·2 → g17-d)
