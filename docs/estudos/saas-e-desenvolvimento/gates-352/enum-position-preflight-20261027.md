# #352 — preflight do parecer 6433564033: bloqueio adicional em app_role

Data: 27/10/2026; evidência recolhida entre 04:14 e 04:21 UTC. Revisões: 6433564033 e 6431939022.

## Estado
Ciclo interrompido antes de publicar código ou alterar o plano. Não houve novo G1 nativo nem G2; os 448 residuais continuam a ser o resultado do ciclo anterior, não uma medição deste ciclo. Reserva mantida. Live apenas por SELECT de catálogo e dos ledgers autorizados.

GitHub = Lovable = 520d145c0de6f89179d8e4587947092a7f52e427, agente livre na verificação inicial. Main privado continua em d3c006118d89bf8c7a5b1b1c643df2866a55e52a. Live tem 711 versões Supabase e 280 Drizzle; foram recolhidos os seis novos ficheiros Drizzle do HEAD, ainda não incorporados no plano.

## Sanitização
Preparação local da reviewed_literal_allowlist fechada, ligada a função, OID, linha e SHA-256 exactos. Preflight sobre 43 funções: exactamente 9 admissões, sem outro bloqueio nessas funções. Cinco testes Python passaram: admissões exactas; rejeição por OID diferente, função diferente, linha diferente e hash diferente. Estes testes não são testes nativos de G1. A alteração ainda não foi publicada.

## Contraprova da suficiência do overlay autorizado
O overlay limitado a orphan/20260319225846, L1–3, coloca manager, editor e viewer com AFTER user. Mas há outro primeiro INSERT de valor de enum no plano:

- orphan/20260408181545_67344d56-9c18-4699-92ac-86a153e96f98.sql, L2: ADD VALUE de partner sem BEFORE/AFTER.
- ledger/20260408192819_20260408192817_publish_phase1_migration_from_pg_dump.sql, L1: ADD VALUE IF NOT EXISTS de partner AFTER viewer.

O órfão executa primeiro e acrescenta partner no fim. A instrução do ledger encontra o valor existente e não o reposiciona. Qualquer escolha de BEFORE/AFTER apenas nas três linhas de Março deixa manager e editor existentes quando partner é acrescentado no fim; portanto não consegue colocar partner antes deles.

A referência nova de pg_enum em Live dá partner=2.375 e marketing_manager=2.4375. A análise estática da sequência com o overlay autorizado dá partner=4 e marketing_manager=2.375; também desloca os cinco papéis acrescentados depois. São sete diferenças numéricas. Esta é prova por leitura da sequência e modelo estático, não resultado de um run nativo.

Hashes:
- Original 20260319225846: eab304ed9c102f351e75f560803330e403d54696958958ca81e3cf4981990b22.
- Cópia executável preparada, limitada às três linhas: 48eaa23fed7e644b156140c9fa69dd1df18988241476ad7529e5bb82775ef4e3.
- Órfão 20260408181545: a55c45636a4a7e6aed0a4031a6dd442427370684723974a1c61754f857d56ab9.
- Referência pg_enum exportada nesta etapa: 3c1831962c5939297fac5700ad00b11a9db3a17bc1d88fae3535b2cdc90bb12f.

## Caso devolvido ao revisor
É necessário incluir explicitamente a L2 de orphan/20260408181545 na enum_position_overlay, acrescentando AFTER viewer na cópia executada, antes de o ledger encontrar o valor. Proposta apenas: não aplicada. Nenhum original foi alterado; nenhum tipo ou objecto foi apagado.

R1–R4, N9, pgmq e restore_shadow continuam pendentes de implementação e validação neste ciclo. Recolhidas definições de catálogo para preparação, sem executar DDL. O critério final mantém-se: G1 desde vazio com igualdade de enumsortorder e checkpoints; depois G2 N1–N9, com objectos exclusivos do replay ainda bloqueantes. QUADRO e estado não foram alterados.
