# Estado — Fecho, Fechamentos e Sócios

Actualizado em 2026-09-14 (fim de sessão). **Frente sem trabalho em curso.**

## Em que pé está

O motor dos fechamentos e a prestação de contas estavam correctos. O que falhava
era o **ecrã do Portal do Sócio**: quando o servidor não respondia, calculava uma
alternativa por conta própria e mostrava números que não batiam com o fecho.
Isso terminou. O Portal passou a obedecer à configuração, a dizer o motivo quando
não há fecho, e a confrontar o acesso a um evento com o sócio que a conta
representa.

### O que ficou feito hoje

- **N representantes por sócio.** Um sócio é uma empresa com N pessoas de gestão:
  a relação é **N utilizadores → 1 sócio**. A base de dados nunca impôs o
  contrário (`idx_profiles_linked_supplier` não é único). Em Live:
  `set_partner_portal_user(_supplier_id,_profile_id)` deixou de limpar outros
  perfis; `unset_partner_portal_user(_profile_id)` é o caminho para desligar;
  ambas registam em `system_audit_log` com
  `entity_type='partner_portal_link'`. **Motivo da existência das RPC:** a UI
  fazia `UPDATE profiles` directo e a única política de UPDATE é
  `id = auth.uid()` — apanhava 0 linhas, sem erro, e mostrava sucesso.
- **Base de IVA do portal pela configuração**, via `partnerUsesGrossExpenses`
  (D-ERP9): a regra própria do sócio manda; na ausência dela vale o contrato do
  evento. Antes o portal estava em **modo Brasil fixo, em seis sítios**.
- **Sem sócio resolvido, não se mostram números.** Nunca assumir base por
  defeito.
- **«Ver como sócio» para o admin**, autorizado no servidor (platform_admin ou
  admin da empresa do evento, e o sócio tem de existir em `event_partners` do
  evento), registado com `viewed_as_admin`. Substitui a prática de usar
  utilizadores de teste com ligações reais em produção.
- **Receita de bilheteira pelo `total_value`** e não `quantity × unit_price` (dava
  90.195,93 onde o ERP diz 90.196,23).
- **Fim do fallback silencioso.** A query do fecho devolve estado explícito
  (`ok` | `unavailable` | `error`); 403 é motivo legítimo, tudo o resto é falha
  registada com `console.error` prefixado `[partner-statement]`. Sem fecho não se
  mostram cartões nem "O seu fechamento".
- **Acesso confrontado com o sócio.** `get_partner_bp_realized` e
  `get_bp_l3_attachments` passaram a exigir que `user_supplier_id(auth.uid())`
  participe no evento (`event_partners` do evento ou do pai);
  `get_partner_event_partner_expenses` e `get_partner_event_tx_aggregates` já
  tinham trava equivalente. A lista do Portal e a página do evento deixaram de
  mostrar eventos onde o sócio não participa; religar alguém a outro sócio avisa
  quais os eventos que ficam fora de vista.

### Verificação final, ao vivo

Evento **Ivete Clareou 2026**, utilizador ligado à **SUPERSOUNDS**: receitas
**509.260,99 €**, despesas **819.061,27 €**, resultado **−309.800,28 €** —
iguais ao ERP ao cêntimo.

### Estado dos oito parceiros

Todos com ligação registada; **nenhum depende já da resolução por coincidência de
email**. FEBRACIS com três representantes (Everton, Thaciane, Juliana Teste),
SUPERSOUNDS com dois (Gilana, Pedro Coelho), ANITTA com Marianna,
EVERYTHINGISNEW com Tânia, RAFAEL LOBO com Rafael.

## A trabalhar agora

Nada. A frente fica sem trabalho em curso.

## Pendências

1. **Decidir o destino de `expense_includes_iva`.** O motor **ignora-o** por
   decisão (g4: a base é do fechamento); o helper partilhado
   `partner-calc-basis.ts` **lê-o**. Hoje só a **EVERYTHINGISNEW na Anitta EDA
   2026** tem override (`false`) divergente do contrato do evento
   (`net_result_gross_expenses`). Enquanto não for decidido, portal e Fechamento
   podem divergir para esse sócio.
2. **Remover o fallback por coincidência de email em `user_supplier_id`.** Já não
   é usado por ninguém e é o mecanismo que pode atribuir a entidade errada a quem
   partilhe domínio de email.
3. **Nenhum sócio tem a permissão `view_partner_transactions`.** Enquanto assim
   for, o ramo de cálculo local (agora só visível sem fecho) não vê patrocínios,
   apoios, F&B nem receitas sem rubrica.

## Bloqueios

Nenhum.

## Factos que não se reinvestigam

- Ivete Clareou 2026, SUPERSOUNDS: 509.260,99 / 819.061,27 / −309.800,28 —
  Portal igual ao ERP ao cêntimo.
- Receita de bilheteira soma-se por `ticket_sales.total_value`.
- A relação utilizador ↔ sócio é N→1; escrita só pelas RPC
  `set_partner_portal_user` / `unset_partner_portal_user`.
- `has_permission` depende de `current_company_id()` e devolve falsos negativos
  numa sessão service_role — medir com `has_permission_in`.
- `iva_rate` é inteiro: em SQL usar `/100.0`, senão a divisão é inteira.
- O Portal nunca calcula o fecho: os números vêm do `partner-statement`.

## Onde ler mais

- `docs/handoffs/2026-09-14-portal-do-socio.md` (arquivo desta sessão)
- `docs/handoffs/2026-09-13-fecho-e-socios-g7-g17.md`
- `.lovable/memory/features/partner-settlement.md`
- `.lovable/memory/features/partner-rls-and-bp-edit.md`
- `docs/DECISIONS.md` (D-ERP9, D-ERP63 → D-ERP66)
