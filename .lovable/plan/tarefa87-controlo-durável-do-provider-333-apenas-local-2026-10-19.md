# Tarefa87 — controlo durável do provider #333, apenas local

## Âmbito e coordenação
- Base GitHub/Lovable confirmada: `460cb2e55c80caa8cb7c61efe7a0986d74bceab2`. Controller confirmou CI411 quality SUCCESS.
- Reserva exclusivamente #333. Não alterar CAPI, portal-track, testes322, reserva Claude, #323 nem configurações legadas.
- Manter uploadEnabled, ANALYSIS_ENABLED e ANALYSIS_PROVIDER_REVIEWED false. Fase8 PARCIAL, fase9 não liberada, fase10 PARCIAL.

## O que será implementado
1. SQL completo **INERTE**, identificado por tarefa87 em `supabase/manual/`, fora dos dois diretórios de migrations. Relação dedicada singleton por integração/workspace, fechada/não revista por defeito; revision crescente e trilha técnica mínima sem dados pessoais.
2. Operações servidor service-only para leitura, claim global atómico, marcação do início potencial do POST, pausa/negação e finalização com claim/revision exatos. Nenhuma operação reabre o provider; não criar endpoint administrativo ou botão de reabertura.
3. Adaptador durável integrado na análise existente, mantendo validação de sessão/empresa/documento e resposta final. Configuração ausente, malformada ou indisponível recusa antes de criar headers ou chamar o provider.
4. Contrato explícito entre falha comprovada antes do POST e resultado incerto após início do transporte. Crash, cancelamento após POST ou incerteza mantêm bloqueio até conferência futura autorizada; nenhuma lease expira libertando retry.
5. 402 pausa por créditos; 403 nega acesso; 404 marca indisponível. Códigos públicos tipados, sem guardar corpo upstream. Não há retry/probe/fallback. Recusa HTTP200 termina só o pedido, não pausa globalmente.
6. Revalidação de contexto e revision antes de devolver candidatos; finalização tardia nunca limpa claim alheio nem reabre pausa. Stop propaga cancelamento, sem promessa de zero cobrança; 6000 tokens não constitui orçamento monetário.

## Provas e entrega
- Testes Vitest herméticos default com doubles do SDK/fetch e RPC; regressões85/86 preservadas.
- PostgreSQL real descartável por socket local, duas conexões independentes: concorrência, claim, pausa, revisões, cancelamento antes/depois POST, crash, finalização tardia, ACL/RLS/search_path/owner, troca de empresa e configuração ausente. Runner separado opt-in, sem PG externo/browser ou `/tmp/browser` obrigatório no CI default; requisitos ausentes falham explicitamente.
- Deno check, runtime offline e bundle dos módulos afetados; verificar resultados do harness de tipos/build e executar suite default sem mudar testes alheios.
- Fontes SQL e rollback revisáveis, diff concreto, hashes, comandos/exitcodes, checklist honesta das18 fases e dependências para eventual aplicação/ativação. Fecho só333 e libertação só da sua reserva; novo CI GitHub aguarda controller.

## Detalhes técnicos
- SQL usa locks de linha e estado persistido, não Map local. Claim UUID e revision transportados como valores exatos; singleton impede bypass por tenant.
- Tabelas com grants explícitos apenas necessários ao service_role, RLS e sem acessos anon/authenticated; RPCs com REVOKE de PUBLIC/anon/authenticated, GRANT service_role, owner confiável e search_path fixo. Não tocar ACL de data_entry_settings.
- Separar política/contrato puro, adapter RPC e instrumentação do transporte em módulos próprios pequenos. Atualizar apenas AGENTS.md de data-entry se a regra estrutural precisar refletir o controlo; raiz preservada.
- Rollback local fecha primeiro o controlo; remoção revisável somente dos objetos novos, sem CASCADE, sem aplicação Cloud.

## Proibições
Nenhuma consulta/escrita Cloud, migration registrada/aplicada, documento real, segredo lido, chamada paga/modelo real, Auth/Storage, deploy, Publish, cron, ativação ou repetição de pilotos/limpeza81/83.

## Dependências futuras
Revisão controller do SQL/rollback e número migration sem colisão; autorização independente de aplicação; conferência explícita/reabertura pelo responsável em fluxo futuro; configuração/runtime hospedado/prova externa e autorização de fase9. Esta tarefa não fornece nem autoriza essas etapas.