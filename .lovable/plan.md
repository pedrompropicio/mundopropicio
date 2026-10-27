# P6a — Posição Financeira (R1 autorizado)
- Página `/erp/posicao-financeira`, menu e acesso pela permissão existente; hook por empresa ativa/ano, sem escritas.
- Parse estrito do JSON da 0283; campos ausentes/tipos incorretos dão erro, valores nulos legítimos permanecem nulos. Mostrar apenas agregados devolvidos, nunca somar no cliente.
- Secções na ordem do despacho, atualização manual, EUR pt-PT, datas civis, saldos protegidos, P5 desativado.
- Ocultar exclusivamente as projeções no dashboard através de opção de renderização; manter componente e análise existente.
- Testes de regras, hook e integração com dados sintéticos, suite completa e verificação visual sem contas Live. Tipos/build pelo mecanismo automático da plataforma; CI remoto verificado separadamente, nunca presumido.
- Fecho R0 e reserva libertada; sem DDL/DML/migrações/edge/Publish.