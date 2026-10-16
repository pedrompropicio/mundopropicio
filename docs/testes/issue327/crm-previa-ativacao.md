# #327 — CRM efetivo e prévia de ativação

Autorização Pedro: 16/10/2026 16:59 Fortaleza. Execução a partir das 20:00 UTC.
Baseline local e GitHub main verificados iguais: `aa253336c599edfdfa0c7fb85c653f5708523bbe`.
Reserva/âmbito: Issue327 conforme mensagem de Pedro; QUADRO/estado/CHATS/DECISIONS não alterados.

## Implementação real, não patch inerte

- `src/hooks/useClubActiveConfig.ts`: leitura apenas `status=active`, por site. Draft não substitui ativa. Loading, erro, refetch e dados de outro site bloqueiam edição e gravação. Revalidação imediatamente antes de gravar.
- `src/lib/club-config-source.ts`: política partilhada dos valores controlados e escritas. Nenhum novo editor de ativação.
- `CrewsSection.tsx`: revisão/aplicação efetiva da intenção do patch. Pontos versionados só leitura; UPDATE não envia points. Mínimo/máximo/ativa continuam na regra realmente consultada pelo motor. Inserir regra ausente sob config ativa é recusado, não inventa habilitação.
- `NewgangSite.tsx`: todos os editores encontrados de `club_point_rules` e `club_levels` passam pela mesma política. Regras controladas bloqueiam points; nomes/chaves, criação e remoção ficam protegidos sob config ativa. Benefícios permanecem editáveis sem modificar nomes, limiares ou direitos. Presença/palpite mantêm a edição existente. Recompensas por posição não mudaram.
- Ranking continua `club_ranking`, que já chama `club_member_level`; não existe segundo cálculo por thresholds no CRM. O RPC de nível é service-role-only, portanto não se alargaram grants para o cliente nem se fez uma chamada proibida por membro.
- `MemberPointsDialog.tsx`: extrato paginado com ordenação estável, sem soma cliente truncada. Total, quando aberto pelo ranking, vem do próprio ranking; outros pontos de entrada mostram extrato sem total inventado.
- `AGENTS.md`: regra estrutural da fonte única/fail-closed.

## Semântica efetiva e atenção

`club_crew_cfg` lê min_members/max_members/active da regra. Active=false produz pts=0 e o wrapper `club_award_fixed` recusa pagar antes do motor versionado. O mesmo ocorre se o valor legado de habilitação for <=0, mesmo com active=true. Não se alterou esse comportamento: o CRM avisa quando suspenso e não grava points ignorado. A regra atual tem 200 e ativa=true, pelo que não bloqueia o cutover proposto.

Máximo efetivo = greatest(max_members ou 6, min_members ou 4). A UI preserva a validação existente min>=2 e max>=min. A decisão aprovada continua 4–6 e o estado atual cumpre-a; não foi criado um bloqueio de negócio novo impedindo o editor existente de guardar outros limites efetivamente respeitados pelo motor.

Limiares canónicos vivem em club_levels (atualizados atomicamente pelo cutover); a config regista a versão. Por isso bloqueiam-se também nomes/criação/remoção após ativação, preservando a identidade dos pisos adquiridos. Benefícios não entram no cálculo e não se congelam.

Existe uma pequena corrida inevitável sem nova escrita atómica no servidor: config pode ativar entre a última leitura e o UPDATE legado. A UI revalida antes de cada escrita e bloqueia durante refetch; não se promete serialização da UI com SQL cutover. Passo operacional: ninguém deve editar Clube durante a janela de ativação. Nenhum DDL/RPC novo foi autorizado ou aplicado.

## Prévia Live só leitura — 20:03:40 UTC

- Membros 29; confirmados 18.
- Tiers atuais: Gang 29, Crew 0, Goat 0. Pisos previstos neste retrato: 0.
- Ledger: 19 linhas, 1950 pontos, MD5 da concatenação ordenada `row_to_json(club_points)` por id: `422b5a6170f1b3247a5b7d9b8c8787bd`.
- Inscrição: 18 linhas/1800 pontos; indicação: 1 linha/150 pontos. Todas as 19 linhas têm event_id NULL e são elegíveis ao exame legado (não se altera ledger).
- Zero créditos anteriores à criação do site; zero órfãos.
- Config `2027-v1` draft; zero cutovers e zero pisos existentes no site. Valores draft: 100/75/cap750/100/200, legacy_counts=true, referral_void_frees_cap=false, purchase_enabled=false, níveis 0/750/3000.
- Regras atuais: inscrição100, indicação150, Crew200 (min4/max6/ativa), compra própria500, indicada300, presença100, palpite50; todos active=true.
- Níveis atuais 0/500/1500. Nenhum valor ativo mudou nesta tarefa.

Consulta das hashes/EXECUTE por pg_proc confirmou: ranking `ef026eb2cf406a4ff587a201b25496b6` (authenticated permitido), nível `ce870321295623ca033330d56fd8a52c`, regras públicas `c90512519a68530dcbf42ab0bea0bb9d`, cutover `522f1b302373fd06f5622fa799d221e4` (authenticated recusado nos três últimos). Crew cfg/check também recusados. Uma tentativa SELECT de chamar crew_cfg diretamente foi recusada por permissões, sem alteração/grant; semântica verificada pelo corpo SQL e testes reais locais, não por execução RPC Live.

## Mudanças exatas previstas, NÃO executadas

- Inscrição100 mantém-se uma vez por adesão/site (referência idempotente do membro).
- Indicação150→75, teto750/membro/edição. Os 150 legados válidos consomem teto; anulação não reabre teto. Indicador original não é reatribuído; membro já confirmado não dispara indicação nova.
- Crew200 por grupo→100 uma vez/membro/edição; mínimo4/máximo6, criador incluído e 5.º/6.º elegíveis.
- Compra própria500→200 na configuração/montra de referência, mas continua indisponível sem prova/integração; compra indicada300 inalterada e indisponível. Não ativar purchase_enabled.
- Crew500→750; Goat1500→3000. Pisos preservam nível adquirido e ledger não é reescrito. Aqui previsão de pisos=0, a recalcular imediatamente antes.
- Conquistas3/5 amigos sem pontos adicionais. Presença100/palpite50 inalterados. Não ativar missões complexas.

## CUTOVER, locks e reversão revistos

Os ficheiros manuais CUTOVER/ROLLBACK e migrações0177/0178 ficaram byte-a-byte intactos nesta tarefa.

CUTOVER é uma transação BEGIN→guard site/evento e draft exatos→RPC com níveis anteriores esperados→verificações→COMMIT. A RPC obtém lock exclusivo do site antes de config FOR UPDATE, enquanto créditos/retries usam site partilhado antes de linhas do membro; retrato legado/pisos e thresholds/regras/config/log são atómicos. Não há DDL no cutover, portanto não cria nova relação PostgREST e não se prevê repetir o embed ambíguo corrigido na infra. Pedidos de crédito podem esperar pelo lock; não se promete zero latência nem zero indisponibilidade. Com 29 membros não foi medido tempo Live, pois executar cutover está proibido.

ROLLBACK exige API compatível já ativa; mantém RPC canónica até COMMIT e só depois usa fallback de RPC inexistente. Guard aborta se alguém desceria de nível; nunca definir `club327.rollback_allow_level_drop=on`. Preserva ledger/pisos/provas/contagens. É reversão global da infra e não simples troca da config: exige janela sem editores e revisão dos consumidores antes da execução; o ficheiro não obtém o lock exclusivo nem pausa todos os produtores. Não executar concorrente com créditos; não prometer reversão concorrente totalmente serializada. Em falha verificada, preparar autorização/plano operacional específico em vez de correr cegamente. Sem rollback nesta etapa.

## Validação

- Baseline Vitest exit0:156 ficheiros passados,1 skipped;1254 testes passados,1 skipped,11 todo.
- Final Vitest exit0:158 ficheiros passados,1 skipped;1271 testes passados,1 skipped,11 todo.
- 17 testes novos:12 política concreta +5 integração React com cliente/query reais e transporte mockado. Fetch externo lança erro: egress bloqueado. Exercitam guardar antes/depois ativa, loading/erro, refetch/sitechange, bloqueio de points/nomes/limiares, benefício permitido e ranking Goat1500 canónico.
- PostgreSQL17 descartável real, runner `scripts/club-sql-it/run327.sh /tmp/issue327/pg`:exit0; série141/141,concorrência9/9,epoch18/18,pending12/12; controlo negativo deadlock detetado, reversão30/30 hashes baseline,0 descidas em137 fixtures,Goat1500 e membro negativo preservados. Só socket Unix/sem TCP/extensões externas/credenciais removidas.
- Compilação automática após correção TS do teste:build OK em20:08:17 UTC. Não se correu build/tsgo manual duplicado, por regra do ambiente. Não atribuir exit numérico ao harness que só reporta build OK.
- CI do BASELINE aa253336:API GitHub HTTP200,run completed/success. CI do commit final ainda não disponível enquanto a plataforma não criar/sincronizar o commit; não confundir com CI baseline.
- Não foi feito E2E autenticado no CRM de produção nem guardar dados Live; integração é local com fixtures. Portal não alterado nem deployado.

## Como verificar Publish ERP futuro e ativar depois

1. Rever este diff, esperar commit automático e confirmar HEAD GitHub=Lovable/CI final verde. Revalidar exclusividade da Issue327.
2. Pedro autoriza Publish ERP. Depois confirmar `/version.json`: commit=HEAD publicado, buildId/builtAt novos. Não Publish nesta tarefa.
3. No CRM/site Newgang, abrir Clube: ainda draft, pontos atuais editáveis; leitura falhada bloqueia. Não mudar valores em produção para testar. Verificar ranking/benefícios/Crews e ausência de erros.
4. Obter autorização EXPLÍCITA de Pedro para CUTOVER. Repetir `supabase/manual/20261016_issue327.PROVA_LEGADO.sql`, ledger/hash/tiers, draft e níveis atuais. Confirmar API compat e tooltips portal publicados. Garantir nenhum editor Clube aberto a gravar.
5. Pelo executor autorizado, executar UMA VEZ o ficheiro exato `supabase/manual/20261016_issue327.CUTOVER.sql`, numa transação pelo canal operacional autorizado para DML (não reaplicar0177/0178). É o passo que chama club_points_cutover com níveis esperados0/500/1500; não inventar editor nem ativar por UPDATE manual.
6. Confirmar config ativa única/log, ledger/hash inalterados, floors calculados, thresholds/regras/montra corretos, compras indisponíveis, ranking protegido. No CRM:100 Crew só leitura/versão,75 cap750,limiares750/3000 não editáveis,benefícios preservados. Revalidar público site/bundle sem PII e sessão real já existente só leitura, sem Wallet externo manual.

## Questões/decisões em aberto

Nenhuma decisão de negócio nova. Falta CI do commit final e verificação após Publish ERP; ativação aguarda autorização própria do Pedro. Reversão concorrente não está garantida pelo script e deve ser planeada numa janela própria se necessária.