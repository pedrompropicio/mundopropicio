# Resultado do laboratório — etapa concluída para revisão

Data: 24/10/2026. Executor: ChatGPT/Codex, por autorização expressa do Pedro. Sem merge ou publicação do ERP.

## Versão e prova

- Origem dos ficheiros reais: `29e18c96f4ebcc76bd1471cd4a68b333f966f12f`.
- Código do laboratório testado: `6ff8a60b0b34bde3f12729f1bf46662700f9035f`.
- Branch: `study/351-isolated-update-lab`.
- [Workflow isolado — run 40092280944](https://github.com/pedrompropicio/mundopropicio/actions/runs/40092280944).
- Job `isolated-tests`: `120867230320`, completed/success; logs consultados pelo executor.
- Execução remota: 24/10/2026, 12:02:18–12:02:53 UTC (09:02 em Fortaleza). Node 24.21.0; Playwright 1.57.0; Chromium 143.0.7499.4.
- A comparação com a origem mostrou apenas adições em `tools/update-lab/` e no workflow próprio da branch. Nenhuma alteração em `src/`, `vite.config.ts` ou no workflow de qualidade do ERP.

## Resultados verificados

| Grupo | Resultado | O que comprova |
|---|---|---|
| Lógica e servidor | 11 PASS, 0 falhas, 0 skip/todo | Execução dos módulos reais com adaptadores e validação da origem dos ficheiros |
| Navegador Chromium | 10 PASS, 0 falhas, 0 skip/todo | Navegação real e preservação/perda do texto no formulário fictício |
| Pedidos de rede da aplicação nos cenários | Sem tentativa externa observada pelo interceptor | Pedidos do browser limitados à origem local do laboratório; worker sintético não faz fetch |
| Acesso ao ERP Live | Nenhum | Nenhum cliente Supabase, sessão ou endpoint real usado |
| Produção | Inalterada por esta etapa | Sem merge, deploy, Publish, DDL/DML, crons ou integrações reais |

As 21 verificações incluem duas verificações de fingerprints (uma por grupo); não são 21 fluxos independentes do ERP.

## Comportamento atual reproduzido

No cenário de versão nova, sem modal nem gravação simulada em curso, o atualizador real pede navegação mesmo com o formulário marcado como alterado. O teste em Chromium confirmou que o recarregamento limpa o texto não guardado da página fictícia.

As guardas atuais de modal e de gravação simulada também foram verificadas: nesses cenários, o aviso adia a navegação.

O sinal sintético de troca do controller confirmou o caminho de reload atual. Isto não é ensaio do Workbox de produção.

## Proposta experimental verificada

- Nova versão oferece aviso e não recarrega automaticamente, mesmo quando a página está ociosa.
- Texto fictício permanece preenchido; botão de atualização fica indisponível enquanto há alterações.
- Guardar a simulação apenas libera o botão; não provoca atualização.
- Clicar em Atualizar, sem trabalho pendente, realiza uma navegação sem ciclo.
- Gravação ou modal iniciados depois do aviso são revalidados no clique.
- Em dois separadores, atualizar um não recarrega o outro nem apaga o seu texto.

A política experimental está apenas em `candidate-manager.js`; o componente de produção permanece intacto.

## Isolamento e execução

Servidor ligado a loopback, rotas fechadas e CSP de mesma origem. Recusa de Origin estrangeiro, rota desconhecida e método não permitido testadas. Cinco ficheiros fonte conferidos entre GitHub e leitura do projeto, com bytes iguais e SHA-256 em `sources.json`.

Localmente, os 11 testes de lógica passaram. O primeiro comando de navegador falhou por ausência de Chromium; a descarga local devolveu arquivo inválido. Esse obstáculo foi resolvido executando os cenários no job isolado do GitHub, onde os 10 testes de browser passaram. Nenhuma falha de infraestrutura local foi contada como aprovação.

Instalação de Node/Playwright/Chromium no runner usa rede para ferramentas. O workflow tem permissões contents:read, checkout sem persistir credenciais e não recebe segredos de ambientes nem faz deploy.

## Limites e próximo passo

- Não é homologação integral da #352: não há BD/Auth/storage/integrações de teste neste laboratório.
- Hooks e notificações usam adaptadores; não houve montagem do ERP em React real.
- Worker e registo são sintéticos; falta validar Vite/Workbox reais, cache de assets e fallback de chunk.
- Não houve teste iOS/Safari, Android nem revisão independente por Claude.
- Não foi executada a suite completa do ERP ou o seu typecheck; nenhum código de produção foi alterado. A CI aprovada é a do laboratório, no SHA identificado acima, e não um gate de publicação do ERP.
- #351 e #352 permanecem abertas. Reserva desta etapa libertada; continuar exige novo âmbito autorizado. Não iniciar integração automaticamente.
- Próximo passo proposto: revisão independente desta branch e preparação do ambiente de homologação completo; depois definir patch do ERP e plano de compatibilidade/atualização.

## Registo documental

As reservas e o fecho desta etapa ficam na #351. A revisão automática recusou copiar o QUADRO completo por possível divulgação de dados internos; essa cópia não foi integrada na branch. Apenas ficheiros novos e sintéticos do laboratório foram acrescentados. Não houve gravação na main nem alteração de documentação de outras frentes.
