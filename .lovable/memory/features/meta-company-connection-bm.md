---
name: Ligação Meta de empresa — BM definido pela conta escolhida
description: #250 — crm-meta-fetch-ad-accounts lista contas de todos os BMs (paginado); escolher a conta grava external_business_id/name desse BM
type: feature
---
- `crm-meta-fetch-ad-accounts` já não filtra `/me/adaccounts` pelo `external_business_id` guardado. Segue `paging.next` e guarda em cada item de `available_ad_accounts` `business_id`/`business_name` (null = conta pessoal).
- No `Connections.tsx`, o seletor mostra "Nome (act_x) — EUR · BM X". Ao escolher, grava `selected_ad_account_*` e, se a conta tem BM, `external_business_id/name` desse BM (coluna NOT NULL: conta pessoal mantém o BM anterior).
- Na sincronização de `ad_platform_account_links`, sem primary existente: promove a conta escolhida; sem conta escolhida, uma do BM guardado ou a primeira. Nunca promove conta de outro BM quando já há conta escolhida.
- Meta fetch-pages, syncs e publicação não leem `external_business_id` (usam `selected_ad_account_id`). Google usa-o como fallback de customer id — outra plataforma, não afectada.
- Atenção: reconectar por OAuth (`crm_upsert_meta_connection`, ON CONFLICT company+platform) reescreve `external_business_id` com o primeiro BM de `/me/businesses`, mantendo a conta escolhida — voltar a escolher a conta repõe o BM certo.
- Ligações de artista (`connection_scope='artist'`) seguem `artist-ads-select-account`, não este fluxo.
