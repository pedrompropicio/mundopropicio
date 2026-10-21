# SEPA com data de Lisboa

- Reserva SEPA registada no quadro; preservar #322 e #323.
- Converter datas e carimbos do gerador para Europe/Lisbon, usando um único instante por ficheiro.
- Garantir execução nunca anterior ao dia de Lisboa e preservar o avanço existente para dia útil.
- Confirmar que modal/lista não introduzem datas do navegador no ficheiro; proteger geração após meia-noite.
- Testar com relógio Brasil às 22h, datas explícitas, limites e mudança de hora de Lisboa.
- Executar testes SEPA; a verificação TypeScript fica a cargo da validação automática da plataforma.
- Registar fecho, libertar reserva e reportar diff resumido e SHA disponível, sem DDL, DML ou Publish.

## Detalhes técnicos

Usar Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }) e partes explícitas para hora/data; aritmética de dias úteis em UTC sobre datas civis, sem depender do fuso do navegador. Manter o formato bancário CreDtTm sem offset e as datas escolhidas da lista.