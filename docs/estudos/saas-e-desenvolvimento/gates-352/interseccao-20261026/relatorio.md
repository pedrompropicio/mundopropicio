# #352 — intersecção aplicada; reteste #335 com duas divergências

Pareceres 6427891820 e 6428334589. Reserva mantida. Ciclo completo ainda pendente: os cinco manuais não foram admitidos; cash_watch/offset_balance estão preparados, mas não incorporados no plano por dependerem do lote.

## Evidência nativa

- [Run privado 40412907080](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40412907080), commit ffbdc0a3174016fafe78d31d60ab5959bb916cdf.
- G1 desde vazio: **1.527/1.527**, checkpoints **47/47** e **114/114**, compensação de ACL **2/2**. pgmq **1.5.1** confirmado; era a única versão disponível no bootstrap.
- Par: public main e Lovable e9b76a765ebd15087fa54bf6131ce24ce2b08b12, agente livre; 711 Supabase + 272 Drizzle, todas representadas por identidade/hash. As 270–272 chegaram após o parecer e entraram no par novo; a 269 está confirmada. Nenhuma origem foi substituída pelo SQL de IVA.
- Financial_accounts: colunas 20, 21, 22 numa entrada às 07/09 12:08:52.999 UTC; FK oid 208094 às 12:08:53 UTC, depois de 20260907120852 e antes de partner_aporte_mirror. Limite inferior das colunas: 20260830193950. Nenhum limite aprovado foi deslocado.
- consent_text_versions_channel_check reconstruída do catálogo, com ads, depois da Drizzle id 266 e antes da id 268 (ficheiro 0266).
- Scanner: 1.302 SQL, 0 ocorrências. Testes locais: intersecção 4/4; N8 3/3. Saltos: 2.135 idempotentes e 156 destrutivos, nos artefactos privados.

## Cinco manuais: SQL executado, comparação reprovada

A transacção descartável executou todos os cinco scripts e foi revertida. 278 objectos alterados: 276 iguais e 2 divergentes. Não houve erro SQL nem aplicação dos manuais no plano.

1. public.transaction_offset_control_status(): definition_sha256 diferente. Replay 02432fa55c07ae86684108f136c1658bcc14db0e317b6f5b71772dce5b806b9f; Live 2ea9344cee942ada908cd020d6137086ec21e2f6de64c43d655dae74d9d25d3e. A equivalência de AST usada na triagem anterior não substitui o contrato de catálogo exacto.
2. public.current_company_id(): Live tem EXECUTE para PUBLIC e o replay não. Esta ausência já existia antes do lote; o lote acrescentou apenas issue335_executor. Não foi escondida por N8 nem corrigida. Requer parecer como diferença de propriedade/ACL.

O workflow terminou success porque o script antigo devolvia exit 0 mesmo com passed=false. O artefacto é explícito: **manual_probe.passed=false**. A correcção para devolver erro nesta situação está preparada na entrega privada; o indicador de Actions não foi tratado como aprovação semântica.

## Comparação intermédia N1–N8

Catálogo de Live estável nas 25 categorias durante a janela documentada em resumo.json; ledger também estável em 983 entradas. Comparação usa o estado permanente do G1, anterior à transacção revertida dos manuais. **Não é o G2 final do ciclo solicitado.**

N1: 9052 → 2649; N2: 2649 → 1803; N3: 1803 → 1587; N4: 1587 → 799; N5: 799 → 799; N6: 799 → 799; N7: 799 → 796; N8: 796 → 793.

793 diferenças: (a) 211, (b) 526, (c) 56; nenhuma sem classe. As classes são diagnóstico intermédio. As permutações restantes precisam da triagem attnum_window antes de uma classificação final; não foram corrigidas nem declaradas inevitáveis. N8 preserva os cinco papéis protegidos, PUBLIC, as ACL por omissão da aplicação e memberships que envolvem papéis protegidos.

| Família | Diferenças | Causa/estado |
|---|---:|---|
| Encontro de contas e guardas financeiras (#335) | 270 | 276/278 objectos do lote de cinco manuais coincidem; duas propriedades bloqueiam a admissão. |
| Carreira artística e relatórios de tráfego | 53 | Definições e propriedades restantes após aplicar integralmente o histórico Drizzle capturado. |
| CRM e integrações publicitárias | 109 | Objetos ou deltas sem origem/janela suficiente e propriedades de objetos existentes; inclui as duas tabelas Meta pendentes. |
| Finanças, BP e fecho restantes | 57 | Propriedades ou objetos estruturais de finanças fora dos scripts #335 admitidos; origem indicada por diferença. |
| Portal, eventos e conteúdo público | 22 | Objetos e propriedades de portal/eventos ainda não reproduzidos; sem copiar dados operacionais. |
| pgmq e filas de email | 26 | Versão 1.5.1 igual; as 26 diferenças de objectos continuam visíveis, sem exclusão pela versão. |
| Exceções de aplicação em schemas geridos | 46 | N4 mantém os objetos ou relações-pai referenciados pela aplicação; dependências da plataforma não ocultadas por exclusão adicional. |
| Papéis e privilégios globais | 56 | Residuais após N8; papéis protegidos e ACL por omissão preservados. |
| Outras funções e vistas | 31 | Corpos ou propriedades distintos, presença sem origem demonstrada ou rotinas só no replay; requer parecer por objeto. |
| Estrutura e isolamento restantes | 121 | Diagnóstico provisório; permutações por rever com attnum_window e restantes propriedades para parecer. |
| restore_shadow — origem no ledger | 2 | Objeto de aplicação referido pelo ledger; diferenças encaminhadas ao grupo (b), conforme 6425793808. |

## Outras funções e vistas — dez objectos

- public.delete_email(pg_catalog.text,pg_catalog.int8)
- public.enqueue_email(pg_catalog.text,pg_catalog.jsonb)
- public.move_to_dlq(pg_catalog.text,pg_catalog.text,pg_catalog.int8,pg_catalog.jsonb)
- public.read_email_batch(pg_catalog.text,pg_catalog.int4,pg_catalog.int4)
- public._cache_cancel_contract(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text)
- public._revert_event_to_version(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.bool)
- public._run_invariant_checks_cards()
- public._tmp_rollback_probe()
- public.apply_supplier_credit(pg_catalog.uuid,pg_catalog.uuid,pg_catalog."numeric",pg_catalog.uuid)
- public.auto_create_initial_bp_version()

## Estrutura e isolamento — dez objectos

- public.app_role#3
- public.app_role#4
- public.app_role#5
- public.app_role#6
- public.app_role#7
- public.backup_runs_ok_unico_por_dia_alvo
- public.ticket_sales.ticket_sales_lot_id_fkey
- public.ticket_sales.ticket_sales_zone_id_fkey
- pg_graphql:pg_event_trigger:event trigger graphql_watch_ddl
- pg_graphql:pg_event_trigger:event trigger graphql_watch_drop

## Pendências e limites

Parecer sobre as duas divergências do lote #335. Só depois da admissão dos pré-requisitos podem entrar as reconstruções cash_watch e offset_balance (definições de Live preparadas, scripts divergentes identificados por hash). Falta concluir a triagem geral de attnum_window, repetir o G1 com o plano completo e fechar o G2. Não há fecho verde nem pedido de libertação da reserva.

Apenas SELECT de catálogo/ledgers em Live. Sem dados novos, seeds novos, segredos, infraestrutura, deploy ou Publish. QUADRO/estado ficam com Claude Code. O relatório público contém apenas metadados, contagens, nomes e hashes.

Evidência privada permanente: [e169ba84](https://github.com/pedrompropicio/mundopropicio-replay/tree/e169ba845f614e60b8be86ab46597b69a503fb89/evidence/attnum-20261026). A branch docs/352-attnum-preflight-20261026 guarda N8, testes e a correcção de sinalização do probe; estes últimos ainda não foram integrados em main.
