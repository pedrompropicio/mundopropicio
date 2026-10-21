## Correção dos alertas sem entrega
- Aplicar às três plataformas estado ativo e datas inclusivas no dia local da conta; preservar os restantes critérios dos alertas.
- Usar datas já existentes e guardar datas API em campos existentes, incluindo raw quando não houver coluna. Sem novas colunas, sem apagar histórico.
- Resolver apenas alertas que deixem de cumprir a regra; comparar lista do painel e registo antes/depois.
- Testar datas de fim 11/10, 15/10 e 19/10, limites inclusivos, campanhas futuras e fusos.
- Confirmar os resultados país/gasto Litto e manter emails de fontes desligados; captura Artists depende da renovação do cookie pelo Pedro.

## Detalhes técnicos
Atualizar funções SQL por migração rastreada, preservando ACL e verificações de acesso; partilhar regra de calendário com a verificação de entrega. Sem Publish.