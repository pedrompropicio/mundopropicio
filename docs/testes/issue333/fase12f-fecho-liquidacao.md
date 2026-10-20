# #333 fase12f — fecho (a3/a4) e liquidação (a5) com triggers reais (LOCAL, FECHADO no Cloud)

Base: main = Lovable 77d8f152ae0296be887eed7f9485b5243d6a4283; CI run39452300145 FAILURE (retoma corretiva). Sem Cloud DDL/DML, deploy, Publish, gates, modelo ou Gmail reais.

## Falha CI corrigida
tsgo: `assistant-erp.ts` (leitura do fecho) e `handler.ts` (escolhas do fecho) — o shim de tipos de zod infere campos opcionais; o zod valida-os obrigatórios em runtime. Correção: tipos explícitos após `parse`. Nenhum teste desativado, nenhum timeout alterado. Testes antigos ajustados ao novo contrato (a3/a4 bloqueadas sem plano de fecho; `save_settlement`).

## Implementado
- `_shared/assistant-settlement-plan.ts`: plano de fecho com as regras do modal (receita total_value→qty×preço, bruto com IVA ao cêntimo, elegibilidade = `isSettlementEligibleTxn`, master substitui filhos, sem adiantamentos/advance/carry_over, data não futura, conta de destino ≠ bilheteira, líquido = direito do evento). Casos não suportados (fecho aberto, retenção da sala, remanescente de fatura, sem vendas) → pendente, sem plano.
- Leitor do fecho com JWT do chamador, limites +1 (excesso = erro, não truncagem).
- Revisão: escolha humana de deduções, data e conta de destino; editar invalida a prévia.
- Executor SQL 12f: a4 reconfere deduções (0 escritas); a3 chama `save_ticket_office_settlement` real; a5 atualiza as 2 pernas e confere exatamente 1 pagamento por perna (conta/data/valor/empresa). Âmbito nominal (owner, empresa, expiry) + gate verificados no RPC. Recusas lógicas da base (22/23/P0/42/40) = definitivas; 57/08/53/XX = incerto → "Verificar resultado".

## Prova PG17 descartável (`pg/canon12f.sh` → `canon12f.out.txt`)
Base: 42 triggers e 92 funções canónicas copiadas por `pg_get_functiondef` (hashes em `canon12f-functions.md5.txt`), dados sintéticos só locais. Resultados: âmbito ausente/expirado e gate fechado recusam no SQL; service_role/anon sem EXECUTE; outro papel/empresa/sem sessão recusa; dependências; fluxo a1→a2→a4→a3 (fecho confirmado, dedução paga com 1 pagamento); a5 = 1 pagamento por perna; replays sem duplicar; dados alterados, nova versão, evento fechado por outro caminho, hash e contrato adulterados recusados; concorrência 1 fecho; estado parcial recusado; crash antes do commit sem resíduos; fecho canónico alterado (23a) e perna noutra conta (23b) recusados na execução; já pago = 0 escritas; imutabilidade; rollback com retenção.

## Limitações (validar na janela real)
- Snapshot de funções/triggers, não aplicação integral das migrações; RLS não replicada (executor SECURITY DEFINER local como postgres).
- Advisory lock serializa só o executor; escritas concorrentes pelo modal são detetadas por reconferência (data_changed), não bloqueadas.
- RPC de revisão continua a receber actor/empresa do servidor (service_role após JWT verificado e revalidado no SQL); o browser não os fornece.
- Links de a3 apontam para /bilheteiras (sem rota por fecho).
- UI testada com testes de componente; sem nova captura visual nesta retoma.

## SHA-256 dos SQL INERTES
```
b071c52d689740b17a9d3f4072ff6576e19bc3ba69c3f94f70623c20e650a4d0  20261020_issue333_assistant_review.INERTE.sql
5e0f389aac65091f6ac954e300c63bf1c1b350212135687a13e728568a1e8d8f  20261020_issue333_assistant_review.ROLLBACK-INERTE.sql
157df181fc5503ae8a19d62a34c70fe360a0de527c5390718db9afbe68fea061  20261020_issue333_assistant_review.readback.SELECT.sql
f915bf0b4f99179e06ee1f9b3e77a758a12b31fcb7b8c9449903e78066f3e79f  20261020_issue333_assistant_executor.INERTE.sql
7942b39039320adbac2226082e958091b04b8c35dc54fefacfeac67be0994ce8  20261020_issue333_assistant_executor.ROLLBACK-INERTE.sql
9e1686a291a328e28a713ea63c1d77f7423c2317ac7f40bd99d100a1f84c4957  20261020_issue333_assistant_executor.readback.SELECT.sql
```

## Pacote de ativação (para revisão, não executado)
1. Readback antes; aplicar review e depois executor (bloco único, lock_timeout 5s); readback depois (ACL, gates false, hashes dos writers canónicos = registados acima).
2. Código: REVIEW/EXECUTOR_SCHEMA_REVIEWED=true, ASSISTANT_ENABLED=true, scope {Pedro: Mundo Propício}; CI verde; deploy só data-entry.
3. Janela ≤ 30 min: linha de âmbito com expires_at; gates true.
4. Teste: um fecho real simples (sem retenção/remanescente) a1→a2→a4→a3; a5 só com recebimento verificado no banco. Sucesso: 1 fecho, 1 pagamento por perna, 0 linhas fora da empresa.
5. Fecho: gates false, âmbito apagado, flags false, deploy; readback. Efeitos revertem-se por estorno, nunca por DROP.
