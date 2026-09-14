# HANDOFF — 2026-09-14 · Portal do Sócio (base de IVA, ligação ao sócio, fim do fallback)

> Arquivo. **Não é fonte de estado.** Para saber onde estamos, ver
> `docs/estado/estado-fecho-e-socios.md`.

**Frente:** fecho-e-socios
**Executado em produção:** sim — RPC do portal (`set_partner_portal_user`,
`unset_partner_portal_user`, travas em `get_partner_bp_realized` e
`get_bp_l3_attachments`) e o código do Portal.

## 1. Percurso

1. Medição em Live do separador BP do Portal: estava em **modo Brasil fixo** (IVA
   incluído sem condição, em seis sítios), contra `partnerUsesGrossExpenses`
   (D-ERP9). Corrigido para a configuração: regra do sócio manda; na ausência
   dela, o contrato do evento.
2. Sem sócio resolvido, o Portal deixou de mostrar números — aviso único, nos
   separadores BP e Transações.
3. Ligação utilizador ↔ sócio: descobriu-se que a UI fazia `UPDATE profiles`
   directo e a única política de UPDATE é `id = auth.uid()` — apanhava 0 linhas,
   sem erro, e mostrava sucesso. Passou a escrever-se só pelas RPC, com
   auditoria em `system_audit_log` (`entity_type='partner_portal_link'`).
4. Relação **N utilizadores → 1 sócio** assumida: ligar uma pessoa não desliga
   outra; desligar age sobre o utilizador.
5. **«Ver como sócio»** para o admin, autorizado no servidor e registado com
   `viewed_as_admin` — acaba a prática de usar utilizadores de teste com ligações
   reais em produção.
6. Receita de bilheteira passou a somar `total_value` (o produto
   `quantity × unit_price` dava 90.195,93 onde o ERP diz 90.196,23).
7. **Fim do fallback silencioso:** a query do fecho devolve `ok` |
   `unavailable` (403) | `error` (registado com `console.error` prefixado
   `[partner-statement]`). Sem fecho não há cartões nem "O seu fechamento".
8. **Acesso confrontado com o sócio:** `partner_event_access` sozinho não basta —
   o sócio tem de estar em `event_partners` do evento ou do pai. Imposto nas RPC,
   reflectido na lista do Portal e na página do evento; religar alguém a outro
   sócio avisa quais os eventos que ficam fora de vista.

Verificação final: Ivete Clareou 2026, utilizador ligado à SUPERSOUNDS —
509.260,99 / 819.061,27 / −309.800,28, igual ao ERP ao cêntimo.

## 2. Correcções de diagnóstico pelo caminho

- **Primeira.** Atribuiu-se o c/IVA ao **ramo de recurso** (o cálculo local do
  Portal) quando na verdade vinha de **código fixo** no separador BP. O ramo de
  recurso não era a causa.
- **Segunda.** Depois apresentaram-se **defeitos do ramo de recurso** como se
  fossem o estado normal do Portal. Não eram: com o fecho disponível os cartões
  batiam ao cêntimo. O erro estava no **silêncio** quando o servidor não
  respondia, não no cálculo.

## 3. Armadilhas de medição encontradas

- `has_permission` depende de `current_company_id()` e devolve **falsos
  negativos** numa sessão service_role — usar `has_permission_in`.
- `iva_rate` é **inteiro**: `iva_rate/100` faz divisão inteira em SQL — usar
  `/100.0`.

## 4. Fila

1. Decidir o destino de `expense_includes_iva` (motor ignora, helper lê;
   divergência real na Anitta EDA 2026 para a EVERYTHINGISNEW).
2. Remover o fallback por coincidência de email em `user_supplier_id`.
3. Decidir a permissão `view_partner_transactions` — nenhum sócio a tem.
