# #333 — coordenação local por checkpoints

- Substituir a espera humana dentro do executor por estados persistentes: preparado, aguardando ativação, execução única iniciada, aguardando revogação, conferência e encerramento/cleanup pendente.
- Nenhum SELECT pendente nem prazo de cinco minutos entre turnos. Retomar apenas o estado exato e identidade revista, nunca criar conta em retoma ou repetir execução incerta.
- Guardar identidade/baseline e contexto privado em `/tmp` com permissões restritas; manter segredos fora de provas e repositório. Revalidar PDF, identidade, flags, permissões e expiração conforme cada etapa.
- Capturar respostas oficiais integrais por transporte de ficheiro, validando id, fingerprint e schema; recusar respostas trocadas, antigas ou já consumidas.
- Testar dinamicamente pausas longas, ativação/revogação entre checkpoints, expiração, par HTTP, falhas e cleanup independente com doubles locais. Reutilizar PostgreSQL/Chromium locais quando aplicável.
- Entregar prova66, typecheck explícito dos drivers e estado #333; preservar #323/DECISIONS. Fase8 permanece parcial, zero operações Cloud e nenhum piloto.

## Detalhes técnicos
O executor antigo contínuo deixa de ser a entrada de retoma autorizável; a nova entrada exige uma etapa explícita e armazenamento atómico privado. Erros conservam a causa sanitizada e ações de cleanup pendentes, sem polling durante revisão do controller.