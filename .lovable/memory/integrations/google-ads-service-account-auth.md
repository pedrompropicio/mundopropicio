---
name: Google Ads — auth por service account
description: Service accounts PODEM ser adicionadas como utilizadores no Google Ads/MCC (sem DWD); nível máximo é "Padrão"; erros NOT_ADS_USER e PAGE_SIZE_NOT_SUPPORTED
type: reference
---

- O Google Ads **aceita** service accounts como utilizadores na UI (MCC → Admin → Acesso). NÃO é preciso domain-wide delegation nem `sub`. Nunca propor DWD nem troca para refresh token de utilizador.
- Nível máximo possível para service account: **Padrão** (Administrador está desactivado — "As contas de serviço não podem ter acesso para e-mails ou de administrador"). "Padrão" inclui Editar campanhas → suficiente para publicar, enviar conversões offline e Customer Match.
- `NOT_ADS_USER` com chave válida = a service account do secret não está autorizada nessa conta/MCC (pode estar outra autorizada). A propagação após adicionar leva ~1-2 min.
- MCC 974-322-1780; conta 220-004-3144. Secret: `GOOGLE_SA_KEY_JSON` (`mp-audience-google-ads@mp-audience.iam.gserviceaccount.com`).
- Histórico: `mp-audience-api` estava em **Somente leitura** → explica `crm.google_conversion` com 0 linhas desde sempre (upload é escrita).
- API v24: `googleAds:search` **não aceita `pageSize`** (`PAGE_SIZE_NOT_SUPPORTED`, fixo em 10000). O helper `_shared/google-ads.ts` já não o envia.
- Edge functions chamadas com service role têm de aceitar o formato novo `sb_secret_…` (não é JWT) além do JWT legacy — ver `authenticateRequest` em `crm-google-sync-campaigns`.
