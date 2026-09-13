# AUD — Estanqueidade entre sócios (frente fecho-e-socios · épico #146 · tarefa g8)

Data: 2026-09-13 · Ambiente: Live `sfohvvlqccmmebvjgibx` · Natureza: **só leitura e prova**
(nenhum código, DDL ou DML foi alterado nesta auditoria).

Caso de prova: **Anitta - EDA 2026** `fdfb39fe-45f2-43f5-9ec9-7cb536360ae1`, três fechamentos
(raiz `b415da54` · Fechamento Rafael Lobo · Fechamento MP + EIN) e sócios ANITTA, RAFAEL LOBO
e EVERYTHINGISNEW (EIN).

## 0. Princípio auditado

Um sócio só vê o seu fechamento, como se fosse o único. Nunca vê outros sócios além do
colapso permitido ("Sócios locais — NN%" / "Mundo Propício — NN%"), nem sócios, exclusivos,
devoluções, receitas em poder, contas de acerto, extras, adiantamentos ou percentagens de
terceiros, nem nomes internos de fechamentos, nem os termos "nível", "pai", "filho",
"fechamento".

## 1. Identidades — limitação estrutural da prova

| Sócio | Supplier | Email no supplier | `profiles.linked_supplier_id` | Utilizador do Portal |
|---|---|---|---|---|
| ANITTA | `34af52e0-…c049e` | ausente | nenhum | **não existe** (prova por análise) |
| RAFAEL LOBO | `1d62b176-…97a9` | ausente | nenhum | `lobo@vybbe.com.br` `699c117d` (acesso ao evento, não ligado ao supplier) |
| EVERYTHINGISNEW | `c2e0e17f-…c607` | ausente | nenhum | `taniatadeu@everythingisnew.pt` `28c63e6d` (idem) |

Cinco utilizadores têm `partner_event_access` ao evento; todos têm **apenas** o papel `partner`.
Nenhum resolve para um supplier: `user_supplier_id()` faz match por **email** do supplier
(vazio) e `get_partner_settlement_summary` lê `profiles.linked_supplier_id` (nulo) — **duas
fontes de verdade distintas e ambas inertes**. Consequência: hoje, na prática, os RPCs de
sócio devolvem vazio; a estanqueidade *por sócio* está **NÃO PROVADA em dados** e foi provada
por leitura das definições. Mal se ligue um supplier a um utilizador, os defeitos abaixo
passam de latentes a activos.

## 2. RLS — prova executada como o próprio utilizador

Método: `set local role authenticated` + `set local request.jwt.claims` do utilizador, dentro
de transacção (ver §8, Q1–Q3).

### 2.1 Âmbito do evento Anitta

| Tabela | Rafael `699c117d` | EIN `28c63e6d` | pedroneto `c4601931` | Resultado |
|---|---|---|---|---|
| `event_settlements` | 0 | 0 | 0 | OK |
| `event_settlement_participants` | 0 | 0 | 0 | OK |
| `transactions` | 0 | 0 | 0 | OK |
| `financial_accounts` | 0 | 0 | 0 | OK |
| `suppliers` | 0 | 0 | 0 | OK |
| `event_third_party_operations` | 0 | 0 | 0 | OK |
| `partner_paid_expenses` | 0 | 0 | 0 | OK (tabela vazia no evento) |
| `event_forecasts` | 189 | 189 | 189 | OK (BP é conteúdo devido, `view_bp`) |
| `event_partners` | **3** | **3** | **3** | **FUGA P0** |

### 2.2 Fora do âmbito do evento (mesmo utilizador de sócio, contagem global)

| Tabela | Linhas visíveis a `lobo@vybbe.com.br` | Resultado |
|---|---|---|
| `events` | **52** | **FUGA P0** |
| `event_partners` | **8** (sócios e percentagens de todos os eventos) | **FUGA P0** |
| `payment_lists` | **65** | **FUGA P0** |
| `payment_list_items` | **459** | **FUGA P0** |
| `transaction_payments` | **165** | **FUGA P0** |
| `transaction_audit_log` | **1707** | **FUGA P0** |
| `forecast_audit_log` | **384** | **FUGA P0** |
| `partner_advance_expenses` | **1** (adiantamento de outro sócio, outro evento) | **FUGA P0** |
| `event_partner_extras` | 0 (tabela vazia — política igualmente aberta) | **FUGA P0 latente** |
| `event_closing_costs`, `event_cache_*`, `supplier_credits`, `quotations`, `event_forecast_partners` | 0 (vazias) | **FUGA P0 latente** |

Causa comum: **50 políticas PERMISSIVE legacy `USING (auth.uid() IS NOT NULL)`** ainda vivas
(lista completa em §8, Q4). Como são PERMISSIVE, o OR anula as políticas estanques escritas a
seguir — por exemplo `event_partners_select_partner` (`supplier_id = user_supplier_id(...)`)
é totalmente neutralizada por `Event partners viewable by authenticated`. A limpeza de
2026-04-30 (memória *multi-tenant-leaky-policies-fix*) não cobriu estas tabelas.

## 3. Funções SECURITY DEFINER e RPCs

| Função | Rafael | EIN | Análise | Resultado |
|---|---|---|---|---|
| `get_partner_event_shares` | vazio | vazio | Ramo do sócio é estanque: devolve só a própria linha + "Sócios locais (100−própria)". **Mas** soma `profit_pct` de **todos** os fechamentos do evento (`p.event_id = …`, sem filtro de nó): um sócio presente em dois fechamentos vê percentagens misturadas. E o ramo de staff devolve **todos** os sócios com nome — e `is_settlement_staff` inclui o papel **`user`**, atribuído por defeito pelo trigger `handle_new_user`. | **P0 latente + P1** |
| `get_partner_settlement_summary` | 0 linhas | 0 linhas | Identidade por `linked_supplier_id` (nulo) → inerte. Blocos (A) e (B) comparam `partner_id`/`paying_partner_id` (que apontam para `event_partners`) com um **supplier id** → nunca casam; desembolso e ajustes ficam sempre a zero. Bloco (C)(i) idem. Não há fuga, há inoperância. | **P1 (correcção) / OK quanto a fuga** |
| `get_partner_event_partner_expenses` | 0 (sem dados) | 0 | Filtra **apenas** por `partner_event_access` ao evento: devolve adiantamentos e despesas pagas de **todos** os sócios do evento, com descrição e valor. | **FUGA P0 latente** |
| `get_partner_event_tx_aggregates` | — | — | Agrega por sócio/evento; não valida `view_partner_transactions` nem a participação do sócio no nó. SECURITY DEFINER contorna `transactions_confidential_guard`. | **NÃO PROVADO / P1** |
| `user_settlement_visible_ids` | — | — | A recursão sobe do nó do sócio para os **ascendentes** (`own.parent_id = s.id`): quem participa num fechamento abaixo passa a "ver" o fechamento acima. | **P1** |
| `is_settlement_staff` | — | — | Inclui `'user'` na lista de papéis de staff. | **P0 latente** |
| `settlement_local_partners_pct`, `user_settlement_ids`, `user_supplier_id`, `get_bp_l3_attachments` | — | — | Sem fuga aparente; `get_bp_l3_attachments` gateia por `user_has_event_access`. | OK |

## 4. Ecrãs do Portal (`src/pages/PartnerEventDetail.tsx`)

| Superfície | Observação | Resultado |
|---|---|---|
| Escolha do fechamento visível (`partner-visible-settlement`) | Lê `event_settlements` do evento e escolhe **o primeiro filho por `position`** — não o fechamento onde o sócio participa. Para a Anitta seria sempre o "Fechamento Rafael Lobo". Hoje a RLS devolve 0 linhas (bloco não aparece), mas a lógica está errada de raiz. | **P0 latente** |
| `partner_event_shares` | Consome o RPC; render só nome + %. | OK |
| Adiantamentos / despesas pagas | Via `get_partner_event_partner_expenses` — herda a fuga do §3. | **P0 latente** |
| BP, bilheteira, anexos | Gate `view_bp` / `view_partner_documents`; anexos por URL assinada de 1 h via `resolve-attachment-url`. | OK |
| Termos internos no ecrã | Sem "nível", "pai", "filho"; sem nomes internos de fechamentos. | OK |
| Portal público / CRM `26b95793` | Fora do âmbito (outro projeto). | Fora do âmbito |

## 5. Documentos gerados (prova executada, em memória, sem gravar em Storage)

Gerei a Prestação de Contas **XLSX e PDF** para os três sócios em cada um dos três
fechamentos (7 combinações), com dados reais do evento (269 linhas de despesa, 6 de receita,
373 rubricas) e varri **776 células de texto** por documento mais o stream do PDF.

| Verificação | Resultado |
|---|---|
| Nomes de outros sócios no XLSX/PDF | **nenhum**. Acordo sai sempre `<destinatário> NN%` + `Sócios locais NN%`; quando o único outro é a casa sai `Mundo Propício NN%` (regra prevista). As ocorrências de "Anitta" são o **nome do evento** e descrições de patrocínio — não são identidade de sócio. | OK |
| Percentagens alheias | nenhuma (só a própria + o complemento agregado). | OK |
| Receitas em poder / extras / adiantamentos alheios | nenhum (vêm da linha do próprio sócio). | OK |
| Nomes internos de fechamentos | nenhum. | OK |
| Termos proibidos | **"fechamento"** aparece em `Custos do evento devolvidos a este fechamento (internos da sociedade)` (g6) e o rótulo `IVA dedutível devolvido` fala de um mecanismo interno. `FORBIDDEN_DOC_TERMS` não apanha "fechamento" isolado. | **P1** |
| Nome da folha | `Resumo do Fecho` (pt-PT) / `Resumo do Fechamento` (pt-BR). | **P2** |
| Export de desembolso (`export-partner-disbursement.ts`) | Uma folha "Desembolso", só linhas do próprio sócio; sem nomes nem percentagens de terceiros. | OK |
| Descrições de negócio (regra g7) | 0 transações e 0 linhas de BP do evento com "fechamento / exclusivo / v23 / planilha / nível". | OK |

## 6. ERP — painel de Sócios / Encontro de Contas

`buildSoloDocInput` (PartnerSettlementTab.tsx) passa `participants: settlements.map(...)`, mas
`buildPartnerStatementDoc` colapsa todos os não-destinatários antes de escrever — provado em
§5: o documento é estanque **seja qual for o fechamento selecionado**. Rótulos de `extras`
herdam o problema P1 de vocabulário.

## 7. Cache, navegação, logs e URLs

| Superfície | Observação | Resultado |
|---|---|---|
| React-query | `signOut` (AuthContext.tsx:233) limpa badge e estado de auth mas **não** chama `queryClient.clear()`. Chaves do Portal não contêm o utilizador (`["partner_event_bundle", id]`, `["all_categories"]`, `["partner_event_shares", eventId]`, `["partner-settlement-summary", eventId, settlementId]`, …) → trocar de sócio no mesmo separador serve dados do anterior a partir da cache. | **FUGA P1** |
| localStorage / sessionStorage | Apenas `recovery_in_progress` no Portal. | OK |
| URLs | `/parceiro/evento/:id` — só o id do evento; nenhum id de fechamento ou de sócio. | OK |
| Toasts / erros | Mensagens genéricas ("Não foi possível abrir o anexo"); sem ids nem nomes internos. | OK |
| Edge functions com service_role | `resolve-attachment-url` valida acesso antes de assinar; `github-issues` não toca dados de sócio. | OK |

## 8. Queries e scripts anexados

- **Q1–Q3** — contagens por tabela com `set local role authenticated` + `request.jwt.claims`
  de cada utilizador (§2.1) e contagem global (§2.2).
- **Q4** — inventário das políticas legacy:
  `select c.relname, p.polname from pg_policy p join pg_class c on c.oid=p.polrelid
   where p.polpermissive and p.polcmd in ('r','*')
     and pg_get_expr(p.polqual,p.polrelid) ~ 'auth.uid\(\) IS NOT NULL' order by 1;`
- **Q5** — `pg_get_functiondef` de `get_partner_event_shares`, `get_partner_event_partner_expenses`,
  `get_bp_l3_attachments`, `is_settlement_staff`, `user_supplier_id`, `user_settlement_ids`,
  `user_settlement_visible_ids`, `settlement_local_partners_pct`.
- **Q6** — descrições com marcas internas em `transactions` e `event_forecasts` (0 linhas).
- **Script de documentos** — geração em memória + varrimento de todas as strings do XLSX e do
  PDF para os três sócios (output cru em `claude-outputs/`).

## 9. Correções propostas, por gravidade (nenhuma aplicada)

### P0 — dado de outro sócio visível

1. **Políticas legacy `auth.uid() IS NOT NULL`** (50 tabelas, §8 Q4; prioritárias:
   `event_partners`, `event_partner_extras`, `partner_advance_expenses`, `payment_lists`,
   `payment_list_items`, `transaction_payments`, `transaction_audit_log`,
   `forecast_audit_log`, `events`, `event_closing_costs`, `event_cache_*`).
   *Correcção:* dropar cada política PERMISSIVE aberta e substituir por política por papel
   de staff, mantendo a política estanque do sócio onde existe (`event_partners_select_partner`).
   Migration por lote, com prova antes/depois pela query Q4.
2. **`get_partner_event_partner_expenses`** — devolve despesas e adiantamentos de todos os
   sócios. *Correcção:* filtrar por `partner_id` correspondente ao sócio do utilizador
   (identidade única, ponto 4) e devolver vazio se não resolver.
3. **`is_settlement_staff`** — remover `'user'` (e revalidar `'viewer'`) da lista de papéis
   de staff; caso contrário o ramo de staff de `get_partner_event_shares` expõe todos os
   sócios a qualquer utilizador com o papel por defeito.
4. **Identidade do sócio duplicada** — `user_supplier_id` (por email) vs
   `profiles.linked_supplier_id` (usado por `get_partner_settlement_summary`).
   *Correcção:* uma só função canónica (preferir `linked_supplier_id` com fallback por email),
   usada por todos os RPCs e políticas; e corrigir os blocos (A)/(B)/(C)(i) de
   `get_partner_settlement_summary`, que comparam `partner_id`/`paying_partner_id`
   (→ `event_partners`) com um supplier id.
5. **`partner-visible-settlement` (PartnerEventDetail.tsx)** — escolher o fechamento **onde o
   sócio participa** (via RPC dedicado), não o primeiro filho por `position`.

### P1 — termo, nome interno ou estrutura visível

6. **`get_partner_event_shares`** — filtrar por fechamento (nó) em vez de somar `profit_pct`
   de todo o evento, e desduplicar nomes.
7. **`user_settlement_visible_ids`** — deixar de subir aos ascendentes; visibilidade só do
   próprio nó (e descendentes, se necessário ao motor).
8. **`get_partner_event_tx_aggregates`** — validar `view_partner_transactions` e a
   participação do sócio; confinar ao perímetro da raiz.
9. **Vocabulário do documento** — trocar "Custos do evento devolvidos a este fechamento
   (internos da sociedade)" por linguagem de negócio (ex.: "Custos internos da sociedade")
   e "IVA dedutível devolvido" por "IVA dedutível recuperado"; acrescentar `"fechamento"` a
   `FORBIDDEN_DOC_TERMS` com teste.
10. **Cache entre sessões** — `queryClient.clear()` no `signOut` e prefixo de utilizador nas
    chaves do Portal.

### P2 — higiene

11. Nome da folha "Resumo do Fecho"/"Resumo do Fechamento" → "Resumo".
12. Suppliers dos sócios sem email nem `linked_supplier_id`: definir o processo de ligação
    utilizador↔sócio e um alerta quando um utilizador com `partner_event_access` não resolve
    para sócio (hoje falha em silêncio).
13. Repetir esta auditoria com um utilizador realmente ligado a cada supplier, para converter
    os "NÃO PROVADO" em prova de dados.

## 10. Contagem

**P0: 5 · P1: 5 · P2: 3** (11 fugas de tabela agrupadas na correcção P0-1).

## 11. Issues abertas

- P0: #158 (políticas RLS legacy) · #159 (get_partner_event_partner_expenses) · #160 (is_settlement_staff aceita `user`) · #161 (identidade do sócio duplicada) · #162 (fechamento visível no Portal)
- P1: #163 (percentagens por fechamento) · #164 (user_settlement_visible_ids) · #165 (get_partner_event_tx_aggregates) · #166 (vocabulário do documento) · #167 (cache do react-query no signOut)
- P2: sem issue — registados no §9 para tarefa de higiene.

## 12. Correcção #158 — prova (13/09/2026)

Migration `20260913132000_*` aplicada numa única transação, com prova automática
dentro da própria transação (qualquer regressão faria rollback de tudo).

### Condição prévia — tabelas lidas pelo Portal do Sócio

Inventário das superfícies `/parceiro/*` (`PartnerPortal.tsx`,
`PartnerEventDetail.tsx`, `PartnerLayout.tsx`, `src/components/partner/*`,
`AuthContext.tsx`): `partner_event_access`, `events`, `account_categories`,
`bp_versions`, `event_forecasts`, `event_ticket_zones` (+ `event_ticket_lots`
aninhados), `event_sessions`, `ticket_sales`, `profiles`, `suppliers`,
`event_settlements`, `user_roles`, `role_permissions`, `user_permissions`.

RPCs chamadas pelo Portal — todas `SECURITY DEFINER`, logo fora do alcance destas
políticas: `get_partner_event_tx_aggregates`, `get_partner_event_shares`,
`get_partner_event_partner_expenses`, `get_partner_settlement_summary`,
`get_partner_bp_realized`, `get_bp_l3_attachments`.

Cruzamento com a lista `v_zero` da prova: **nenhuma** tabela lida pelo Portal
entra na lista das que passam a 0. As que o Portal lê e estavam no inventário
legacy (`events`, `event_sessions`, `event_ticket_zones`) já têm política
estanque de sócio; `account_categories` e `role_permissions` receberam política
de sócio nesta mesma migration. Condição cumprida — aplicado de imediato.

### Estado antes / depois

| Métrica | Antes | Depois |
| --- | --- | --- |
| Políticas PERMISSIVE com `auth.uid() IS NOT NULL` | 51 | **0** |
| Políticas `*_privileged_roles` com `has_staff_role` | 0 | 51 (50 SELECT + 1 INSERT) |
| Contagens da staff (`pedroneto`) nas 48 tabelas medidas | baseline | iguais ou superiores |
| Tabelas fora do âmbito de sócio visíveis a `lobo@vybbe.com.br` | 45 com dados | **0** |
| `events` visíveis a `lobo@vybbe.com.br` | 52 | apenas os seus |

Prova corrida como cada utilizador com `SET LOCAL ROLE authenticated` +
`request.jwt.claims`; passou sem excepção (`NOTICE: Prova #158 OK`).

### Pendência do Pedro (DML — não executado)

`producaotec@mundopropicio.com` (`89f1397b`) tem apenas o papel `user` e não é
sócio: era staff que entrava só pelas políticas legacy e hoje não entra. Pertence
à empresa **Coala Festival Portugal** (`7d831e59`), não à Mundo Propício. Atribuir
o papel correcto nessa empresa é decisão do Pedro e é DML.
