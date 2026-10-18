# #333 — classificação do hash divergente, preparação pendente

- Preparar SQL novo e reversão guardados pela impressão da fonte aplicada, alterando apenas o erro de hash divergente em `check` para `42501`.
- Preservar locks, identidade, permissões, gates, retornos e todos os demais `40001`; não editar migrações aplicadas.
- Provar antes/depois/reversão em PostgreSQL17 descartável, duas conexões, dados e ACL iguais, e endpoint real com transporte de erro explicitamente simulado.
- Documentar fontes primárias, limites causais, diff e plano único posterior em Live para revisão do controlador.
- Sem aplicação Live, deploy, Publish, contas novas, hash errado Cloud ou ativação nesta entrega.