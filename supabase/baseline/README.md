# Baseline G3 da #352

DDL por objeto, destinado exclusivamente ao replay local descartável. O âmbito vem do Sim 6449906971 e da confirmação do G2 6450286547. Estes ficheiros ficam fora de `supabase/migrations` e não são aplicados pelo Lovable.

O manifesto inclui 39 operações R2, 165 de tail, 25 de reconciliação R6/R7 e definições finais, 8 compensações de membership pgmq e 70 compensações ACL por objeto (`acl_final_from_live`). Mantém os pareceres, a janela, os hashes de Live e OID/attnum quando o catálogo os fornece. Para objetos ausentes em Live, regista a prova de ausência, sem inventar OID.

Cada SQL tem uma formulação idempotente. A execução nativa repetida e a aceitação G1/G2 do G3 estão pendentes. O CI desta entrega verifica apenas integridade, limites da publicação e sanitização; não declara o G3 verde.

Não são publicados inputs históricos do replay privado, dados, seeds, segredos, catálogos globais ou valores de ACL fora das compensações DDL já aprovadas. O transporte dos inputs históricos adicionais ficou bloqueado pela revisão automática de aprovação. A reserva #352 mantém-se até resolver a portabilidade e concluir o detector periódico contra Live.

Verificação local:

```sh
python3 -m unittest discover -s tools/baseline-352 -p 'test_*.py'
python3 tools/baseline-352/check_pii.py
```
