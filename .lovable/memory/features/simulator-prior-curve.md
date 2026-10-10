---
name: Simulador — curva histórica (#89 m2)
description: "Usar histórico de…" grava prior_editions + evento-fonte; só sugere, piso manual ganha
type: feature
---
- Config em event_simulator_config: sales_curve_mode='prior_editions' + sales_curve_prior_event_id; 'preset' + NULL = curva por defeito.
- Extra = reais ÷ fracção acumulada no dia relativo − reais; fallback se sem curva, > D-180, % 0 ou sem vendas.
- Per capita A&B é global da empresa: só texto de sugestão, nunca escreve no A&B.
- Ver D-ERP241.
