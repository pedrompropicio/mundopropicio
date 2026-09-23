---
name: Ligação Meta de empresa — BM definido pela conta escolhida
description: #250 — available_ad_accounts lista todos os BMs (só para escolher); ad_platform_account_links só tem a conta escolhida + contas do mesmo BM
type: feature
---
- `crm-meta-fetch-ad-accounts` não filtra `/me/adaccounts` pelo BM: segue `paging.next` e guarda em cada item de `available_ad_accounts` `business_id`/`business_name` (null = conta pessoal). Esta lista é completa e serve SÓ para escolher.
- REGRA (seguimento #250): numa ligação de empresa, `crm.ad_platform_account_links` só tem a conta escolhida (`selected_ad_account_id`) e as contas do MESMO BM (`business_id = external_business_id`). O seletor do topo (useAdAccountSelection/AdAccountSwitcher) lê estes links, por isso nunca mistura BMs.
- fetch-ad-accounts: faz upsert só das contas elegíveis; sem conta escolhida não cria links; se não há primary, promove apenas a conta escolhida.
- `Connections.tsx`, ao escolher a conta: grava `selected_ad_account_*` + BM da conta (se tiver), faz upsert do link da conta escolhida com `is_primary=true, enabled=true`, tira o primary às outras da ligação e põe `enabled=false` nos links de outro BM (determinado via `available_ad_accounts`). Nunca apaga linhas.
- Links antigos que violam a regra não são corrigidos automaticamente (decisão do Pedro caso a caso).
- Meta fetch-pages, syncs e publicação usam `selected_ad_account_id`, não `external_business_id`.
- Reconectar por OAuth (`crm_upsert_meta_connection`) reescreve `external_business_id` com o 1.º BM de `/me/businesses`; voltar a escolher a conta repõe o BM certo.
- Ligações `connection_scope='artist'` seguem `artist-ads-select-account`; ambos os caminhos acima saltam-nas.
