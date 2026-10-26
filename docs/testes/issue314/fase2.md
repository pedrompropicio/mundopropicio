# #314 Fase 2 (R2) — textos v4/v2 e age_class no newgang-portal

Executor: agente Lovable ERP para o 0 · Cowork (Claude). «Vamos avançar» do Pedro: 26/10/2026 17:48 (Fortaleza). HEAD de partida f78cd61407e8d2f58132032cad747fdfa124530f (CI #865 verde nesse commit). Sem DDL, DML, crons, sync, Publish, outras edge functions ou portal-track.

## Lidos
docs/testes/issue314/fase1.md, docs/features/newgang-consentimento-pessoa-332.md, supabase/functions/newgang-portal/person-consent.ts, profile.ts, index.ts (caso "me"), docs/QUADRO.md (reserva #314).

## O que mudou
- `supabase/functions/newgang-portal/person-consent.ts` linhas 3–5: CONSENT_TEXTS passa a email-v4, anuncios-v2, whatsapp-v2 com os textos exatos do pedido (sem alterar uma vírgula).
- `rg` em newgang-portal e _shared: essas eram as únicas ocorrências escritas à mão de email-v3/anuncios-v1/whatsapp-v1. Não há nenhum sítio no portal que ACEITE versões — a aceitação é só na BD (conjuntos {email-v3,email-v4}, {anuncios-v1,anuncios-v2}, {whatsapp-v1,whatsapp-v2} da 0266), por isso o portal ainda não publicado pode continuar a enviar email-v3 até ao Publish e a BD aceita; versão desconhecida continua rejeitada na BD.
- age_class: `profileMe` devolve o objeto de `club_profile_state` tal qual (sem lista branca nem delete/omit) e o caso "me" espalha `...profileView` — o campo age_class (adult | minor | under13 | unknown) chega à resposta sem filtros. Nenhum outro campo alterado.

## Testes
- Novo `src/test/issue314-fase2-portal-consent.test.ts` (vitest, 8/8): textos exatos v4/v2, ausência de versões antigas escritas à mão, payload reencaminhado sem filtrar versões, profileMe sem filtro de campos, me com ...profileView, 4 valores canónicos de age_class com unknown seguro.
- tsgo --noEmit: exit 0.

## Deploy (só newgang-portal)
- source_sha256: 54f1864586f99cd142ca26fa62917b7411dd4f706b55eef69dc8543680f87acc
- 401 {"error":"no_session"} verificado com Origin https://newgangfestival.pt (sem sessão).
- Prova em Live do campo age_class NÃO feita: não existe procedimento aprovado em docs para sessão de teste; fica para a verificação do portal. Nenhuma escrita em Live executada.

## Em aberto
- Portal Newgang (projeto 1a915f50): formulário data de nascimento, pixels.ts, club-consents.ts, perfil — Publish só pelo 0.
