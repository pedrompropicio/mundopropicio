# Convites Newgang pendentes — leitura apenas

Base reconfirmada: HEAD local = GitHub main `e1a38559d9ac3b5ace48bad79978690e90762de7` (consulta GitHub sem cache).

Lidos: `supabase/functions/newgang-portal/AGENTS.md`, `crews.ts`, `pending.ts`, `history.ts`, `pending_test.ts` e `.lovable/memory/features/portal-newgangfestival.md`.

## Contrato aditivo de `me`
- `referrals.pending_friends`: até 50 objetos `{short_name, at}`, mais recentes primeiro.
- `referrals.pending_friends_total`: contagem exata após exclusão dos duplicados, independente do limite.
- `crew.pending_members`: até 20 objetos `{short_name, at}`, mais recentes primeiro, apenas se a sessão pertence à crew resolvida pelo servidor.
- `crew.pending_members_total`: contagem exata independente do limite.
- `at` corresponde a `club_members.created_at`; nome via `history.shortName`, ou `Convidado`.
- Falha opcional de leitura: lista vazia, total `null` e respetivo `pending_friends_error`/`pending_members_error` = `unavailable`, sem inventar total zero ou quebrar os campos antigos.

Somente SELECT pelo cliente existente. Filtros obrigatórios de site, empresa e `confirmed_at IS NULL`; amigos filtrados pelo membro da sessão e crew pelo código resolvido no servidor. Desempate por `id DESC`, sem devolver esse identificador.

Duplicados: `pending_crew_code IS NULL OR pending_crew_code <> código da própria crew` aplicado no SQL dos amigos ANTES de `count: exact` e `LIMIT 50`. Assim também se excluem os convidados além dos primeiros 20 da crew. Sem pertença a uma crew, não há consulta de convidados de crew nem exclusão de amigos por crew inacessível.

Preservados `history`, `crew.members`, `referrals.confirmed_friends`, `pending_crew`, pontos, níveis, limites e participação nas crews. Não executar `me` em Live para validar: o caminho legado de `pending_crew` pode limpar pendências.

## Verificação Live já realizada
SELECT agregado em 20/10/2026, 02:13 UTC: **67** pessoas com `pending_crew_code` e sem confirmação em **50** crews. Todas correspondem a crews existentes; as 67 também têm referral de um membro dessa crew; **0** códigos sem correspondência. Não repetida nesta entrega.

`API-CONTRACT.md` não existe no ERP; este documento regista o contrato aditivo.

## Testes e pendências
Testes locais Deno, sem rede/base/env: limites 50/20, ordem, ausência de nome, duplicados, projeção sem dados privados, contagens exatas, escopo e ausência de leitura da crew para não membros; falhas opcionais sinalizadas.
Resultado: **17/17 Deno** (7 novos + 10 `pending_test.ts`) e **9/9 Vitest** (history/crews). Novo módulo passa `deno check`; preview `build OK`. A verificação Deno completa da função mantém o erro preexistente TS2783/TS2785 em `wallet_sync` (`ok` duplicado), confirmado também no index da base `e1a3855` em cópia temporária; não alterado por ser alheio ao pedido. Nenhum novo erro de tipos encontrado.
Sem DDL, DML, migrações, deploy ou Publish. Validação do novo contrato em produção e apresentação pelo Portal dependem de autorização posterior; não foram executadas.