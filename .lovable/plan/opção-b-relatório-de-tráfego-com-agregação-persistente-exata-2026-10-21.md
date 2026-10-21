# Opção B — relatório de tráfego com agregação persistente exata

## Resultado
Eliminar a leitura de cada chegada ao abrir `artist_ads_period_report`, mantendo os mesmos números, visitantes únicos e JSON. Metas no banco: 30 dias < 1 s; 90 dias < 2 s.

## Alteração proposta
- Manter `song_link_arrivals_hourly` e a `artist_ads_compare` intactas; acrescentar estruturas privadas complementares para chegadas por campanha e deduplicação exata de visitantes. Alterar a chave da tabela atual não seria DDL aditivo.
- Guardar contagens por hora UTC, artista/empresa, canal efetivo, origem UTM, campanha UTM e país. Preservar NULL e texto original nas dimensões onde o relatório atual os distingue.
- Conservar os identificadores já anonimizados necessários para contar cada visitante uma só vez por dia UTC/canal ou dia UTC/origem/campanha. Nunca somar visitantes únicos de horas ou países diferentes: deduplicar novamente para o período e filtro pedidos.
- Não usar sketch aproximado: contrariaria a igualdade de números exigida.

## Manutenção e segurança
- DDL exclusivamente aditivo, via ferramenta de migração, com `lock_timeout='5s'`, GRANT explícito ao serviço e RLS sem leitura direta por utilizadores ou anónimos.
- Manutenção INSERT/UPDATE/DELETE, incluindo mudança de `ip_hash`, empresa/artista e dimensões UTM; falhas ou contenção não podem impedir a captura. Registar horas pendentes para reparação.
- Reconstrução em blocos de horas UTC com exclusão mútua e reconhecimento apenas dos pendentes anteriores à leitura da origem. Reutilizar a reconciliação noturna existente sem criar novo horário.
- Preservar classificação canónica de canais, inclusão de teste no agregado e exclusão no relatório. Preservar comportamento atual perante alterações do canal do link; nenhuma cópia da classificação pode divergir silenciosamente.
- Backfill completo sem apagar ou alterar `song_link_events`. O relatório continua na versão atual até a nova base estar completa e validada.

## Verificação e passagem
- Testes locais de contagem exata: visitante repetido entre horas, países e campanhas; NULL; canais teste; mudanças de identidade/dimensão; remoção; concorrência e reparação.
- Validar origem versus agregado e JSON antes/depois com a sessão do Pedro para Litto, BR/PT/sem país, 7/30/90 dias; ignorar apenas `gerado_em`.
- Medir tempos no banco e pela chamada autenticada; só declarar a meta atingida com medições reais. Verificar também `artist_ads_breakdowns` e as outras chamadas de Tráfego.
- Ativar a leitura agregada apenas depois das provas. Sem Publish, sem deploy de funções externas, sem índice da alternativa C e sem dados fictícios no ERP.

## Atenção
Visitantes exatos exigem mais armazenamento do que contagens simples. O desenho mantém essa informação privada e derivada da origem existente; não armazena IPs reais. A meta de velocidade será verificada, não presumida.