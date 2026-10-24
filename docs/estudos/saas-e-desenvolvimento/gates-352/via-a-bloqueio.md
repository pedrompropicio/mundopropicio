# #352 — VIA A: exportação validada, execução bloqueada

24/10/2026. Executor Codex; revisor Claude (0 - Cowork), por leitura. Autorização Pedro: VIA A, comentários [6388062199](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6388062199) e [6388851607](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6388851607); autorização adicional expressa para ajustar a validação de run.py. Sem R2.

**G1 vermelho/bloqueado; G2 vermelho/bloqueado. Nenhum novo run.** A implementação foi parada após rejeição automática de create_tree, conforme a instrução de Pedro para parar/reportar se não fosse possível executar exactamente o âmbito. Não houve tentativa por outro canal. O relatório e o anexo contêm apenas resultados de leitura e metadados; não publicam SQL do ledger nem corpos de overlays.

## Verificações concluídas

- Reserva em QUADRO criada antes da exportação, commit `71e7b7ab3ed74d445bf9cb9db8de68b61c3124ac`; main inicial `607142fb091c819669c1d38cb6980da8f99832d6` igual a Lovable, agente livre.
- **711 versões** recolhidas por SELECT de version/name/statements[1], com hora UTC por lote, SHA256 e MD5 calculados na origem. Todos os 711 ficheiros locais conferidos byte a byte por hash; nenhum SQL normalizado. Primeira20260317112301, última20261002120810.
- Correcção de unidade do parecer: **3.050.400 caracteres = 3.056.333 bytes UTF-8**, demonstrado por SELECT sum(length)/sum(octet_length); não é alteração de conteúdo.
- Varridos padrões de JWT, Bearer literal, chaves Supabase/Stripe/OpenAI/GitHub/Google/Meta, cabeçalhos com chaves literais e credenciais em URL. **0 ocorrências detectadas; 0 redacções.** Isto descreve a varredura, não uma certificação de que qualquer segredo possível seria reconhecido. Dados de produção existentes no SQL não foram exportados como resultados de tabelas operacionais; os corpos SQL ficaram apenas na preparação local.
- **389 comparações** com os ficheiros Supabase do repositório, normalização somente de whitespace: **383 iguais / 6 diferentes**. Os383 já eram iguais em bytes. A lista completa está no anexo.
- **242/242 hashes Drizzle resolvidos**, ids1–242 por ordem do ledger, sem usar o journal para ordenar. 0016 histórico emc075613c paraid17,0164 históricob7b62836 paraid165,0240 da#355 paraid242. 240 fontes actuais utilizadas +2 históricas. Hash de0240: `b80d4eaf339e1769bfad664adefebadb86a9e7a3ca07a833ac57e4d2c77fc189`.
- Plano local de **953 entradas**:711 ledger, depois242Drizzle. Nenhum ficheiro supabase/migrations entra directamente; corteSupabase20261002120810. A restrição temporal aplica-se à origem Supabase, conforme os pareceres, preservando a sequência Drizzle posterior expressamente solicitada.
- Runner preparado localmente para validar as duas referências e respectivos hashes; mantidas as guardas de alvo local, hashes, agendador desligado após reset e firewall. Recusa sem plano/target homolog e py_compile passaram. Conferidos953hashes de origem e39overlays locais. **Runner não publicado nem executado.**

## Seis diferenças ledger versus ficheiro

| Versão | Ficheiro do repositório |
|---|---|
| 20260510024841 | `supabase/migrations/20260510024841_8544fa7b-7eef-4f9e-ae2c-5daf2e88ac0b.sql` |
| 20260510025749 | `supabase/migrations/20260510025749_a42b1d83-1f99-420c-91e1-20e84ac896f6.sql` |
| 20260510033845 | `supabase/migrations/20260510033845_add_marketing_manager_role.sql` |
| 20260510034045 | `supabase/migrations/20260510034045_crm_permissions_and_budget_limits.sql` |
| 20260511120000 | `supabase/migrations/20260511120000_crm_oauth_states_table.sql` |
| 20260511120100 | `supabase/migrations/20260511120100_crm_oauth_rpc_helpers.sql` |

O ledger é a fonte do plano. Nenhuma das diferenças foi corrigida por edição do original; os hashes dos dois lados permitem revisão posterior.

## Scanner e limite de autorização

O scanner do ledger encontrou171instruções candidatas:124DML de topo,27RAISE emDO e20cron/net de topo ouDO. São contagens lexicais, não execução nem prova de equivalência. 624 e949 têm statement do ledger exactamente igual ao ficheiro original, permitindo conferir os intervalos. A inserção da turnê existe no ledger sob20260318234225, diferente da antiga versão32/20260318234226; a ausência desta última no ledger não implica ausência da operação histórica.

Na preparação local, Codex interpretou a regra de excluir DML operacional como autorização para39overlays locais: os4casos especificados (624/949/0200/0205) e35adicionais detectados no ledger. Foram retiradas85instruções operacionais de topo; mantidos DDL e referência (categorias/cidades/permissões/buckets/invariantes/exclusões de backup/metadados de expiração). Nenhum overlay de homologação foi preparado. Os7overlays vazios antigos e3correctivos foram excluídos do plano; fontes históricas passaram a cópias imutáveis emledger/drizzle.

**Esta interpretação dos overlays adicionais não foi aceite pela revisão automática.** Todos os39 ficam agora como propostas não publicadas, com intervalos, motivo e hash no anexo; não se afirma que Claude tenha aprovado individualmente os novos hashes. É necessário fechar o âmbito antes de retomar. Não se recomenda prosseguir com reconstrução manual de colunas nem com overlay vazio para esconder schema ausente.

## Rejeição e ausência de efeitos

A revisão automática rejeitou a chamada `github_create_tree` que incluía SQL exportado e overlays, por dois motivos: materializar casos que deveriam ficar apenas listados para revisão e publicar grande volume de SQL interno com operações potencialmente destrutivas. A execução parou imediatamente, sem repetir o pedido por outro canal.

Três objectos de árvore preparatórios (plano,runner,manifesto) chegaram a ser criados no Git, **sem commit nem actualização de referência da branch**. O passo rejeitado não foi materializado. Não foi disparado workflow. HEAD da branch de estudo permanece `e7f04426ad0fbcc9d73884dd939f0e591f597f71`, anterior à VIA A. Os711SQL e os39overlays preparados não estão publicados na branch.

Não há novo catálogo local completo, catálogo Live actualizado ou diff G2. G1/G2 não são marcados verdes; não se afirma zero divergências sem classe. Sem DDL/DML emLive, infraestrutura, contas, custos contratados, deploy, Publish ou leitura de valores de segredos. G6 permanece comPedro.

## Passagem para revisão

[Anexo completo de metadados](via-a-verificacoes.json):711versões/hashes/horas/querySHA,389comparações,242resoluçõesDrizzle,171candidatos do scanner e39propostas de overlay com intervalos. Sem corpos SQL.

Antes de retomar, clarificar a autorização dos35overlays locais adicionais: manter apenas os4explicitamente indicados e listar os restantes para revisão, ou rever/autorizar cada caso adicional. A publicação dos711SQL na branch isolada também ficou abrangida pela rejeição automática; requer resolução dessa revisão com o âmbito e as barreiras de execução explícitos. Não substituir pelo catálogo parcial ou por outra tarefa. Nenhuma autorização R2 solicitada.

Reserva própria libertada no fecho documental após nova verificação #329; outras reservas preservadas. #352 permanece aberta.
