# #352 — G3 validado manualmente; agenda desligada

Execução de 27/10/2026, autorizada por Pedro em 6454492672. [Fecho canónico na #352](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6454775348) e [run específico verde](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40590761911). Reserva mantida.

| Prova | Resultado |
|---|---|
| G1 desde vazio | Verde; 1547 entradas |
| Idempotência nativa | 307 ficheiros aplicados duas vezes |
| Checkpoints | 114/114 e 47/47 |
| Regressões | 10 testes aprovados |
| Scanner | Zero em 1534 ficheiros |
| G2 congelado e atual | Verdes, N1–N9, zero categorias bloqueantes |
| Exceções e políticas | Apenas R8 já aprovado; 152 políticas de storage iguais |
| Catálogo atual | 25 categorias estáveis; 711 entradas Supabase e 286 Drizzle; inclui 0284 |
| Isolamento | Base descartável, cron off, egress externo REJECT |

Pacote: g3-validation-current-catalogue.zip, 43 ficheiros e 277744 bytes de fontes. SHA-256: c316fc12b8b9b9ef890bb2975c9e6f32b1a312a933956c9fe704f07f3db0d715. Conferência dos 43 blobs publicados: iguais ao ZIP. Commit privado: 7800568c4d53300b3040538f4cf393d7b5a88ed5.

Artefacto privado 12773084952, SHA-256 b5d32456077613a3d096d204da90ae58829d98b78dcda2331cc2af562cbde2c7. Os inputs históricos continuam privados. A aceitação é a de 6452933096: repo público, baseline e inputs privados existentes no replay privado. Sem SQL novo nem cópias de inputs históricos.

As regras aprovadas não mudaram. As seis provas adicionais de fixtures passaram no CI; a #383 contém a classificação por ficheiro, tabela, hash e linha. As Issues donas e os encaminhamentos #387/#388 mantêm-se.

A agenda de seis em seis horas está DESLIGADA. A main privada não contém o workflow G3; nenhuma tarefa periódica foi criada. [Desenho da recolha sem credenciais de produção no GitHub](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6454615955). A ativação e certificação da recorrência ficam pendentes; se exigir credencial de produção, para e exige Sim de G5.

Validação manual concluída. Live só SELECT de catálogo. Sem G4/G5/G6, deploy ou Publish. A Issue e a reserva #352 mantêm-se.
