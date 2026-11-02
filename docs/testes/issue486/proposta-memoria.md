# #486 — proposta de memória, sem publicação

Proposta para integrar em `.lovable/memory/features/ads-invoices.md` só quando D2/D3 e a prova funcional forem aceites. Este despacho não altera `.lovable/` nem afirma comportamento publicado.

O candidato D1-C3 deriva da fonte integral #506 HEAD3e4dba865515d69b24a027aa25be0675034e81d2, validada offline. Contrato, mapa de asserts, identidades e limites de prova estão em `contrato-d1.md`, `plano.md`, `function-identities.tsv` e `verificacao-local.md`. SQL apenas preparado; controlo de instalação enabled=false.

- O PDF permanece a fonte financeira; o servidor verifica bytes/identidade antes de atestar digest, versão, empresa, conta e fornecedor/NIF. SQL não lê Storage.
- Todas as linhas, incluindo ajustes sem campanha, têm destino persistido. Company inclui custo sem evento; outside exige motivo e exclui custo; carreira exige TikTok com prova atual da empresa/conta/música/artista.
- Ajuste explícito segue integralmente ao destino; só o anónimo é proporcional à mídia elegível. Somas são decimais exatas, com resíduo determinístico.
- Master é conservado sem cidade inequívoca; split humano conserva parcelas/detalhe. Destino/evento/rubrica/BP/finalidade definem a filha; BPs distintos não são fundidos nem selecionados pela maior verba.
- Compromisso é agregado por linha e rubrica antes dos efeitos.100/70/20+20 exige um aumento10, com aceite e observação próprios. A FK forecast_id vence âncora; ambiguidades bloqueiam.
- Criar draft e aprovar são atos separados no contrato; o candidato usa o escritor e selos canónicos, com manage_bp e papel de aprovação. Deny prevalece inclusive platform_admin. Raise auditado uma vez e baseline existente preservada.
- Geração exige empresa/fatura/BP/compromissos EUR e metadados coerentes, incluindo fx_rate de BP. Importação/plano de outras moedas são conservados; não há FX nem fallback legado.
- Revisão/confirmação/hash vinculam fontes e identidades materiais. Chave repetida retorna IDs estáveis; erro desfaz BP/financeiro/auditorias/operação/tarefas. Reverted permanece terminal até novo ciclo confirmado.
- Reimportação1:1 conserva decisões; identidades ambíguas não são reutilizadas. Alterar/remover outside recusa integralmente. Reversão conserva BP/baseline/histórico e bloqueia por pagamentos/dependências/fechos.
- Original fiscal liga só à mãe; comprovativo de cada filha conserva o detalhe. Ator service_role conclui metadados após bytes/readback em D3, sem regenerar custos em retry.
- Manutenção segue a ordem do produtor; recursos imutáveis, recibos estáveis, retry explícito até8, limites de2048 tarefas/8MiB. Esgotamento impede drenagem; nenhum reset silencioso.
- Leituras operation/preview/list dispensam o cerco financeiro. Generate/revert continuam a serializar globalmente; a futura medição de contenção é requisito, sem promessa de não interferência universal.
- Instalação compara35 identidades/configurações/ACL; `SET search_path TO 'public', 'pg_catalog'` corresponde exatamente a `search_path=public, pg_catalog`. Rollback todo comentado usa RESTRICT e recusa dados/dependências v1.

A memória efetiva deve distinguir preparação, instalação, ativação e prova. D2/D3 fornecem os tipos/UI/textos dependentes em conjunto; o saneamento histórico e #475/#457/#413/#404 permanecem preservados. Nenhum teste TS verde certifica os roteiros PostgreSQL, entrega de PDF ou ausência de handlers antigos em voo.
