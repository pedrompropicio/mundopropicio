# #352 — G1 verde: reconstruções com literais sanitizados
Data: 26/10/2026. Horas das evidências em UTC. Pareceres [6419810897](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6419810897) e [6420287584](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6420287584).

## Resultado verificado
**G1 verde: 1474/1474 entradas concluídas, zero falhas de execução.** Checkpoints **47/47 e 114/114**, sem diferenças. As duas reconstruções sanitizadas passaram a comparação de definição e ACL; a compensação final de ACL passou para os dois alvos. **G2 não executado.** Este resultado não declara paridade integral de catálogo com Live.

- [Run final 40362466400](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40362466400): sucesso, 16:47:40–16:56:11 UTC.
- [Commit privado cc11971](https://github.com/pedrompropicio/mundopropicio-replay/commit/cc11971cbb1b0752318fc91024d61f28d417e370).
- Artefacto privado 12669776407; SHA-256 do ZIP descarregado e conferido: `c4ce32b33d5dc3e02930255bb667b35e93e9eb47cbb4941584d6bbab946e7a31`.
- SHA-256 do plano: `6450c15378f557b675b2059ab954b96a0e1ff386ebdaec13976c9a455f924ca8`.
- Crons locais: 16 exportados antes da remoção, zero depois; agendador permaneceu desligado.

## Regra aplicada e provas
Duas funções só de Live foram reconstruídas pela regra autorizada. Total: **2 emails e 2 hosts de produção substituídos; 28 URLs públicos intactos**. Variáveis de runtime e todos os bytes exteriores às substituições mantêm-se. Nenhum valor original é publicado neste relatório.

Os manifestos privados guardam hashes, classe, posição e substituição determinística. A comparação de definição aplica a mesma transformação idempotente; ACL exacta, excluindo apenas os dois papéis de plataforma já aprovados. As janelas estão provadas por SELECT e pelos vizinhos de OID; a segunda depende da primeira reconstrução +1 segundo, dentro do limite superior. A pesquisa de CREATE em 2139 ficheiros não encontrou origem para nenhuma das duas funções.

Primeira reconstrução:
- Corpo original: `2f121de1b0acafcbe20fbbcace7351331ca2ccaebf6245290627b3c90f5d60ab`.
- Corpo sanitizado: `d528a5982727a1b1aee0c1ec5e775f86ae113fba9ad5b3f6e174e2612e34f569`.
- DDL executado: `91c3f793f2946aaf052d51965aba122cb18aa00edb417aa94aa2e37f4f7116f7`.

Segundo caso equivalente:
- Corpo original: `d9595b1800fa168729d51ecf79d9c171d791dfc5238237da63c9194da29306bd`.
- Corpo sanitizado: `7ba1a07a81c15b6c60a5c37cf8fb4304bf21c008f83cbd3d4ea29362efd320d6`.
- DDL executado: `13c459bb2868e4da1c18e0173c78209536c6df9a878f10f11393b3e8c9b89ea9`.

Referência ACL recolhida novamente por SELECT para os dois alvos: SHA-256 `255feede86580c3dc08c4f5019633091ca91d39098745e859e97694eb1d4f053`. Ambos continuam na comparação final, mesmo quando a reconstrução permite executar GRANT/REVOKE antes saltados. Nenhuma função de produção foi invocada na recolha.

## Validação e correcções do executor
Dez testes locais de sanitização e dez da exclusão de papéis passaram; um teste adicional rejeitou um vizinho de OID adulterado. Os testes nativos confirmaram criação da definição sanitizada sem invocação, bloqueio de vault/chave/rede não pública/pixel, execução do ficheiro real 0210 com asserção preservada e resolução de função com parâmetros nomeados por lista de tipos. Scanner PII: **1264 SQL, zero ocorrências, 918 literais JSON válidos**, em 16:45:28 UTC; gate do workflow final também verde.

As tentativas intermédias ficam preservadas:
- [40355415360](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40355415360): 1442/1473 entradas; primeira reconstrução e 0150 passaram. A 0210 revelou que o filtro de papéis só abrangia o ledger Supabase. Foi corrigido para abranger também o ledger Drizzle, mantendo a lista fechada e omitindo apenas o REVOKE dirigido aos dois papéis já excluídos.
- [40357745519](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40357745519): paragem no teste novo, antes das migrações. Corrigida a preparação da tabela de teste, retirando grants automáticos de bootstrap; asserção intacta.
- [40358740269](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40358740269): 1473/1473 entradas, mas compensação ACL vermelha por segunda função só de Live ausente. Recolhida prova por SELECT e aplicado o mesmo caso autorizado de reconstrução sanitizada.
- [40360935891](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40360935891): o gerador usava nomes de parâmetros em regprocedure. Corrigido para tipos obtidos por SELECT, com teste nativo; corpos e hashes de sanitização inalterados. Nenhuma nova regra de salto.

## Saltos e limites
156 saltos destrutivos. 2135 idempotentes: 1162 base, 611 policy_equal, 175 using_index, 169 trigger_equal, 12 txn_control, 3 insert_duplicate_superseded_by_ledger, 2 grant_revoke_missing_object e 1 insert_duplicate_equal. Outros 10 revistos: 7 data_volume_assertion, 2 platform_role_grant_excluded e 1 orphan_dml_without_effect. Listas completas em `ledger/skipped-*.json` do artefacto privado.

Live apenas SELECT. Sem escrita em Live, DSN, criação de infraestrutura, deploy ou Publish. Ficheiros históricos intactos. A execução completa com os saltos revistos não substitui o diff integral e a classificação do G2.

#329 reconfirmado imediatamente antes de cada push privado, GitHub=Lovable e agente livre. Os dois primeiros usaram 87d7b254e6ad6bb87fa73aee905eba555752a25e; os restantes 64e8fd7fe67fda34cebeef1e00cf16531e53ba60. A confirmação do push documental fica no comentário de fecho. Só este ficheiro novo é publicado no repositório público. QUADRO/estado permanecem a cargo do Claude Code; pedir ao 0 a libertação da reserva desta execução após este fecho de G1. A #352 permanece aberta.
