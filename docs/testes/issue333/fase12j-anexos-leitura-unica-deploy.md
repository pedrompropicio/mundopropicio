# #333 12j — deploy da correção anexos/leitura única (R2) — 23/10/2026 ~03:04 UTC

Autorização: Sim expresso do Pedro nesta sessão — deploy APENAS de `data-entry`. Sem SQL/DDL/DML, flags, âmbito, janela, IA/Gmail reais, login, OAuth, lançamentos, Publish ou outras funções. #322/#323 intocadas.

Base: HEAD main/Lovable `c97cd46e66f1daffec0fa7e5f5fc98d4d60f1657` (código corretivo `1bb6c98f`). CI remoto: run39892501165 job120215293026 quality SUCCESS (confirmado pelo controller; não verificado pelo agente). Recuperação do controlo (script conferir_incerto) já aplicada pelo controller com Sim — NÃO repetida.

Hashes locais do pacote (conferidos antes do deploy):
- `supabase/functions/_shared/assistant-orchestrator.ts` sha256 `6d1ee3ac4b81d66b9e4cf37467b1bc886bc7b28118e12007394b5947f6fce4e1`
- `supabase/functions/data-entry/handler.ts` sha256 `0da9f3b58fbc4518d208d3767293442c8ed95eeb7cabdb14e947ca4c848a516c`
- `supabase/functions/data-entry/index.ts` sha256 `bad41ce54d58d69e6ab87bf80ceaaa413d58483725f10a5c4fdfa7f7d017809c`

## Readback ANTES (read_query, ~03:03 UTC)
Controlo rev81: state=closed, stage=idle, active_claim NULL, reason_code=closed, enabled=false, reviewed=false; executor=false; review=false; âmbitos ativos=0. Auditoria: rev80 uncertain/cancelled_after_post (claim f2a6673b-…) e rev81 admin_action=confer com review_sha256 `1a10801cb17e105f53f0cd378a1938d301ef903961a53e89b8e27755db974c83` (hash do relatório no commit 1a10801c).

## Deploy
Ferramenta oficial `deploy_edge_functions`, `["data-entry"]`: "Successfully deployed edge functions: data-entry".
- source_sha256 submetido (ficheiros + settings): `c1414a2d67917d6c60dfd76816ae256eb0ceebc5c9c7edc26b3b2be889e2a69d`
- Versão/deployment ID: NÃO expostos pela ferramenta. O hash submetido não é prova independente do hash em execução; live verification reportada separadamente pela ferramenta (não consultada aqui).
- Nenhuma outra função deployada; nenhum código funcional editado nesta sessão.

## Endpoint pós-deploy (sem login, sem sessão)
- OPTIONS → 200
- POST sem Authorization → 401 `UNAUTHORIZED_NO_AUTH_HEADER`
- POST com chave pública anon → 401 `Sessão inválida`

## Readback DEPOIS (read_query, ~03:04 UTC)
Idêntico ao antes: controlo rev81 closed/idle/claim NULL, enabled=false, reviewed=false; executor=false; review=false; âmbitos ativos=0. Nenhuma revisão nova na auditoria.

## Não feito
SQL/DDL/DML, criar/renovar âmbito, abrir janela, reset do controlo, repetir conferência, Publish, OAuth, IA/Gmail reais, lançamentos, testes autenticados. #322/#323 preservadas. CI do commit documental posterior NÃO verificado. O teste real da conversa (pesquisa → escolha → anexos → revisão) depende de janela própria com o Pedro; a UI do bloco de anexos está no preview e o Publish geral aguarda nova autorização.
