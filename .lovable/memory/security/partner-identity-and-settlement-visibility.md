---
name: Partner identity and settlement visibility
description: Identidade canónica do sócio (user_supplier_id), fechamento visível = onde acerta (mode='settles'), nominal nunca dá vista, casa implícita = Mundo Propício, cache por identidade
type: feature
---

# Identidade do sócio e visibilidade dos fechamentos (g9b + g9c)

## Identidade
- Canónica: `public.user_supplier_id(uuid)` — `profiles.linked_supplier_id` com
  recurso ao email. Nunca ler `linked_supplier_id` directamente para decidir acesso.
- `partner_id` / `paying_partner_id` apontam para `event_partners(id)` e nunca
  podem ser comparados com `suppliers.id`: usar `user_event_partner_ids(user, event_ids[])`.
- Staff do fecho = `public.has_staff_role(uuid)`. O papel `user` não dá acesso a nada.

## Visibilidade
- **Fechamento visível = onde o sócio acerta contas (`mode = 'settles'`)**.
  `user_settlement_ids` filtra por `mode='settles'`; presença nominal num nó acima
  é contabilística e **não** dá vista (nem do nó, nem das operações de terceiros).
- A visibilidade **nunca sobe**: o sócio vê o seu nó e descendentes, nunca
  ascendentes nem irmãos.
- O Portal escolhe o fechamento por `get_partner_visible_settlements` (primeiro
  resultado). Nunca por `position` nem por `parent_id`. Sem resultado → sem bloco.

## Apresentação ao sócio
- Quotas: se no nó do sócio não houver outro participante não-casa, o resto é
  **MUNDO PROPÍCIO** (casa explícita ou implícita, casa = 100 − Σ participantes).
  "Sócios locais" só quando existem outros sócios no mesmo nó.
- Documento do sócio ("Prestação de Contas"): vocabulário externo apenas —
  "IVA dedutível recuperado", "Custos internos da sociedade", folha "Resumo".
  `FORBIDDEN_DOC_TERMS` (inclui "fechamento" e "fecho") é a fonte de verdade e
  está coberta por teste nos 3 sócios da Anitta em pt-PT e pt-BR.

## Cache
- `AuthContext` limpa a cache de queries na troca de identidade e no `signOut`;
  todas as queryKeys do Portal são prefixadas por `user.id`.

## Ligação sócio ↔ utilizador
- Feita na ficha do fornecedor (`SupplierPortalUserLink`, só em edição).
  `PartnerAccessManager` avisa quando o sócio não tem utilizador ligado.
