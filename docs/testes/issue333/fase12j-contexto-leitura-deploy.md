# #333 12j — deploy corretivo de contexto/leitura (R2, 23/10/2026)

## Autorização e base
Pedro autorizou nesta sessão «Pode desbloquear e avançar»: aplicar SOMENTE data-entry. HEAD local confirmado `70644c80cecabc865b06dcb02c1cefc05ff34977`, igual ao HEAD sincronizado informado no despacho. CI controller run39882147084/job120181756611 quality completed/SUCCESS, todas as etapas verdes; código base83206608/CI39881037898 success: provas informadas pelo controller, não consultadas independentemente pelo agente. CI do commit documental final NÃO verificado.

Lidos: INDEX; QUADRO regras/reserva própria e 0 · Cowork (ChatGPT); estado financeiro; AGENTS raiz/supabase/data-entry; `fase12j-contexto-leitura-correcao.md` e deploy anterior `fase12j-deploy-correcao.md`. Script de janela consultado apenas para nomes dos controlos; não executado nem modificado.

## Readback antes — read_query oficial, 01:11:08.060494Z
executor_enabled=false; review_enabled=false.
control: revision41, state=closed, stage=idle, active_claim=NULL, enabled=false, reviewed=false, reason_code=closed, changed_at=2026-10-23T00:32:26.444177Z.
scope_total=1; scope_active=0; âmbito expirado preservado: created_at=2026-10-23T00:16:34.382935Z, expires_at=2026-10-23T00:32:26.443186Z. Consulta só agregados/controlos e timestamps, sem conteúdo privado ou financeiro.

## Deploy oficial
Invocação `deploy_edge_functions({"function_names":["data-entry"]})`.
Resposta integral:
```text
Successfully deployed edge functions: data-entry
Submitted source SHA-256 (files and settings; live verification is reported separately):
data-entry source_sha256: 85cd678fe990bb2335bbe7f62d2cc7b9b06da571008707b529d2440c847ee87b
```
Hash submetido abrange ficheiros e settings, incluindo dependências enviadas; não é uma verificação independente do hash live. Deployment ID/versão/hash live não expostos pela ferramenta. Nenhuma outra função deployada.

Hashes locais conferidos, iguais ao pacote R1:
- assistant-model.ts: `7c32622131855ca5d75c4a37e96129a5e8a3d87857cc0ea78c14d04633bc7d51`.
- assistant-orchestrator.ts: `c88ad7f05e647ec272a4e23f229c83f56cc93e348b862e5c6c84fa039761c2b4`.
- data-entry/handler.ts: `9470b7559b610dc310ebf4782e1b1b522fb1d4537f1be8453af8bad1c7175308`.
- data-entry/index.ts: `bad41ce54d58d69e6ab87bf80ceaaa413d58483725f10a5c4fdfa7f7d017809c`.

## Endpoint após deploy — HTTP direto, sem login
```text
OPTIONS: 200, corpo vazio
POST sem Authorization, JSON {}: 401
{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}
POST Authorization Bearer chave pública anon, JSON {}: 401
{"error":"Sessão inválida"}
```
Sem sessão injetada, IA/Gmail ou execução de fluxo financeiro. A chave pública não é reproduzida no relatório.

## Readback depois — read_query oficial, 01:11:43.264052Z
Idêntico ao antes: executor/review=false; control revision41 closed/idle/claim NULL/enabled=false/reviewed=false/reason closed; changed_at inalterado. scope_total1/active0; created_at e expires_at exatamente iguais. Âmbito expirado não renovado/apagado. Janela permanece fechada.

## Limites e próxima etapa
Sem edição de código funcional, SQL/DDL/DML, flags, âmbito, OAuth, login, IA/Gmail reais, lançamento, Publish geral ou outras funções. #322/#323 e outras frentes intactas. Nesta R2 não se repetiu a suite local: evidências R1 no relatório de correção e CI do código informado pelo controller.

Reserva própria mantida com deploy concluído e retoma pendente. O controller verifica este deploy e abre os 30min já autorizados; teste pelo preview com UI nova, não pelo site publicado. Nenhuma abertura feita pelo agente e nenhuma promessa de aceitação real antes desse teste.

## Questões/decisões em aberto
Retoma nominal pelo controller pendente. Recomendado: manter a janela fechada até a verificação do controller; não há decisão funcional nova solicitada.