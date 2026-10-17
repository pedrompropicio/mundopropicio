# #332 whatsapp — aplicação em Live (Fase B)

Data: 17/10/2026 ~12:05 UTC. Autorizado por Pedro (Fase B com alteração: HMAC em vez de sha256 simples).

## Decisão HMAC
- `phone_fp` = HMAC-SHA256(telefone, chave) em vez de sha256 simples.
- A migração canónica não pode ler o Vault (bloqueio do canal) → a chave vive em `app_secrets`
  (nome `club_whatsapp_hmac_key`): tabela com RLS sem grants, só funções SECURITY DEFINER leem.
- Valor gerado dentro da base (`gen_random_bytes(32)`), nunca exibido em chat, doc, log ou migração.
- Um segredo Vault órfão criado na primeira tentativa foi removido de seguida.

## Aplicado
- Migração: `drizzle/migrations/0185_issue332_whatsapp_consent.sql` (canal canónico).
- Deploy: só `newgang-portal` (source sha256 a5b8c42eef0ac161d322ed288062c098800c0285cf138fedc01f86c1a187559d).
- Sem crons, sem envios, sem Publish, sem tocar em P_NG27_LISTA / «Reativar» / Wallet / anúncios.

## Prova Live (membro de teste criado pela via real: inscrição → perfil → sessão)
1. Inscrição `clube_newgang` → membro criado de imediato (trigger #332 imediato) ✓
2. Perfil completo pela RPC real → missão 50 pontos atribuída (fluxo real) ✓
3. Conceder sem número → `whatsapp_no_phone` ✓
4. Com número → granted, `number_masked` +351•••••332, `valid_for_current_number=true` ✓
5. Livro: `phone_fp` 64 hex HMAC, sem número em claro ✓
6. Mudar número → `valid_for_current_number=false` ✓
7. Reautorizar → granted, valid=true ✓
8. Retirar sem número → revoked ✓
9. Email e anúncios: unknown→unknown em todas as operações (inalterados) ✓
10. club_points: 53/4875 → 54/4925 durante o teste (apenas +50 da missão do membro de teste) ✓

## Limpeza (autorizada por Pedro, 12:04 UTC)
Removidos: 3 consentimentos whatsapp, 1 ponto (50), 1 perfil, 2 sessões, 1 reserva welcome,
1 email_send_log, 1 membro, 1 lead_capture, 2 leads, 2 contacts, 2 tokens de descadastro
(resíduos dos testes whatsapp e imediato). `session_replication_role='replica'` só para
contornar o guarda append-only na limpeza.
Verificação pós-limpeza: 0 linhas dos dois emails de teste em club_members, lead_capture,
contacts, email_unsubscribe_tokens, club_member_whatsapp_consents, club_points.
club_points de volta ao baseline: 53 linhas / 4.875 pontos / hash 478b8c570440405c4380ad19b61050c8
(membros reais intactos).

## Testes locais (PostgreSQL 17.9 descartável, sem rede)
- SQL whatsapp: 24/24 (inclui concorrência real 8 ligações → 1 linha, stub hmac, egress limpo)
- Regressão #332: 40/40 · Regressão #330: 54/54
- Handler real whatsapp: 4/4 · Regressão handler: 17/17 · Vitest: 1281 passed

## Contrato final (para o portal)
- `club_profile_preferences` channel `whatsapp`, version `whatsapp-v1`, sem `platforms`;
  grant exige `expected_dates.whatsapp` (CAS); revoke nunca exige número.
- Estado em `me`/`club_consent_state`: `whatsapp {state, version, date, number_masked, valid_for_current_number}`.
- Erros: `whatsapp_no_phone` (400), `consent_payload` (400), `parental_flow_required` /
  `consent_revision_conflict` / `idempotency_conflict` (409), `no_session` (401).
- Caixa do portal: marcada só se `state='granted' AND valid_for_current_number=true`;
  se granted mas inválido (número mudou), mostrar como não autorizado e pedir nova autorização.

## Pendências
- Texto whatsapp-v1 aguarda validação jurídica antes de qualquer Publish.
- Descadastro/«PARAR» por WhatsApp: modelo preparado, sem envios nem webhooks.
- Portal separado: integrar a caixa WhatsApp; Publish por Pedro.
