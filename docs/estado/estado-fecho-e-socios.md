# Estado — Fecho, Fechamentos e Sócios (#146)

Actualizado em 2026-09-13 (fim da sessão g7→g14). **Publicado hoje pelo Pedro em
dois Publish: g7, g9c, g10, g11, g12, g13, g13-b, g14.**

## Em que pé está

O motor dos fechamentos, o Encontro de Contas, o documento do sócio e o Portal
estão em produção. A Anitta EDA 2026 corre a três níveis (raiz ANITTA →
Fechamento Rafael Lobo → Fechamento MP + EIN) com C1 e C2 a 0,00. Falta a prova
formal contra a planilha v23, as devoluções ao Fechamento MP + EIN e selar.

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

### Dados da Anitta já tratados (SQL autorizado)

- Oeiras e Bengaleiro na conta "Acerto EIN · Anitta EDA 2026", pagas, IVA 0 em
  Oeiras, descrições limpas.
- A&B Food com "Recebido por: EIN"; bares com "Resultado ficou com: EIN".
- Ajuste da SPA −34.304,72 (`disbursement_adjustment`, "diferença entre 5%
  orçamentado e 3,5% pago").
- `profiles.linked_supplier_id`: lobo@vybbe.com.br → RAFAEL LOBO;
  taniatadeu@everythingisnew.pt → EVERYTHINGISNEW.
- producaotec@mundopropicio.com com papel `producer` na Coala e na MP.
- Descrições do RS 1% Ticketline e do repasse de 905.000 limpas.
- **Nenhuma** linha com `vat_non_recoverable` (confirmado: 0) — o open bar NÃO se
  marca, o IVA negocial é ativo da sociedade.

## A trabalhar agora

1. Devoluções ao Fechamento MP + EIN: Advogado 3.000, Equipa de Produção EIN
   15.000 e ~3 linhas a identificar pelo Pedro.
2. Prova formal contra a planilha v23 — o Pedro fornece os 6 números.
3. Repetir a auditoria de estanqueidade agora que os utilizadores estão ligados
   (P2-13).
4. Selar os 3 fechamentos e fechar a #146.

## Bloqueios

- Utilizador da **ANITTA** no Portal não existe — sem ele não há prova de
  estanqueidade do topo da cascata.
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
- IVA devolvido 262.459,85; nível 3 547.906,69; EIN 273.953,35.
- 1 cêntimo de diferença só de apresentação no Encontro de Contas da raiz
  (417.293,41 no ecrã vs 417.293,42 no motor) — truncatura.
- Políticas PERMISSIVE abertas são proibidas: padrão `privileged_roles` (staff)
  + política estanque de sócio.
- DRE Empresarial e DRE Brasil são vistas de EMPRESA e mantêm os exclusivos.
- Descrições de transações e de linhas de BP são texto de negócio.
- Testes: 7 falhas pré-existentes e alheias a esta frente
  (`storage-multi-tenant`, `forecast-boost`, `EventABTab`).

## Fora desta frente

Para o chat **plataforma-e-infra**: a "email-sending update" do Lovable de 13/09
13:38 — remetente `notify.mpgestaoeventos.com`, cron de minuto a minuto,
`process-email-queue` a exigir sessão autenticada, 8 emails falhados.

## Onde ler mais

- `docs/handoffs/2026-09-13-fecho-e-socios-g7-g14.md` (arquivo da sessão)
- `docs/auditorias/AUD-estanqueidade-socios-2026-09-13.md`
- `.lovable/memory/features/partner-settlement.md`
- `.lovable/memory/features/event-settlements.md`
- `docs/DECISIONS.md` (adendas g4·2 → g14)
