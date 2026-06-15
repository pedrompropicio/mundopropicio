# Customer Match (Google Ads) — botão "ensure" na admin

## Onde
`CRM → Google Ads → tab "Audiences / Customer Match"`
(`/crm/google-ads`, ficheiro `src/pages/crm-admin/google-ads/CustomerMatchEnsure.tsx`,
montado em `GoogleAdsAdmin.tsx`).

## O que faz
Botão "Criar/sincronizar lista no Google" que invoca a edge function
`crm-google-user-list-ensure` em Live, via `supabase.functions.invoke(...)`
(sessão autenticada do utilizador, sem service-role).

Body fixo:
```json
{ "user_list_id": "fc1c186b-17b3-4632-99f7-581e136cd452" }
```

A lista alvo é "MP Leads — Customer Match" da company
`7c858982-6ccd-47ca-bd65-e0dd3eebf01c` (Mundo Propício).

## Permissões
Visível só a `admin`, `platform_admin` ou `marketing_manager` (gate na UI;
a função em si já valida JWT). Outras roles veem mensagem "sem permissão".

## Output
Mostra o resultado cru no ecrã:
- Código HTTP (200, 4xx, 5xx)
- Corpo JSON da resposta — incluindo mensagem de erro completa da Google
  (PERMISSION_DENIED, AUTHENTICATION_ERROR, missing_secret, etc.)
- Mensagem do FunctionsHttpError em texto, se houver

Sem truncagem nem masking (a função não devolve segredos).

## O que NÃO faz / fora de scope
- **Upload de membros**: continua bloqueado na Data Manager API da Google
  (developer token com acesso adequado + endpoint Data Manager). Este botão
  só cria/sincroniza o recurso `userList` na conta Google Ads.
- Não toca em `crm-google-user-list-ensure` em si.
- Não altera policies nem schema.

## Pré-requisitos em Live
- Secrets `GOOGLE_SA_KEY_JSON` e `GOOGLE_ADS_DEVELOPER_TOKEN` presentes.
- Linha em `crm.google_user_list` com `connection_id` válido (já preenchido
  para esta lista — ver migration `20260615195703`).
- MCC `9743221780` / cliente `2200043144` hardcoded na função.
