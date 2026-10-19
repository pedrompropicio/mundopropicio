# #333 fecho95 — correção pós-validação scanner95 (sanitizado)

Base 0ae48384 (CI run39262501561 SUCCESS, controller). HEAD local reconfirmado igual antes de editar.

## Fecho
- Janela fechada pelo controller (responsible close). Gates ANALYSIS_ENABLED/ANALYSIS_PROVIDER_REVIEWED=false; deploy só data-entry, source_sha256 099bfc88d300f73d0571ba4ca43f1002016305f71a609d11114cba73acbbc3d1 (recibo de submissão).
- Readback read-only: control rev11 closed/idle, enabled/reviewed false, claim NULL; allowlist 1 linha preparation disabled/expirada; data_entry_settings 0 abertos; audit 11 linhas, 2 reopen, 2 success (dois ciclos: 93 e 95). Nada apagado.
- Checks: OPTIONS 200; sem auth 401; anon 401. Zero chamadas ao modelo nesta entrega.

## Correções
- Adaptador #333 (pedido próprio; prompt/pedido legado do scanner intactos): moeda só se explícita (ISO, €, £, R$, nomes); "$" sozinho e ausência = null, nunca EUR. Não-EUR mostrada, montantes ficam manuais.
- Data textual (EN/PT, "October 16, 2026", "16 de outubro de 2026", DD/MM/AAAA inequívoca) → ISO determinística; ambígua/inválida → manual.
- Identificadores: pedido literal carácter a carácter; adaptador não remenda separadores; edição humana decide.
- Modal: cabeçalho fixo com fechar, corpo com scroll interno. Revisão: campos editáveis, confirmação conjunta "Confirmei estes valores no documento", um aviso único deduplicado, sem termos internos. Prévia vinculativa/execução inalteradas.

## Testes
Vitest 75/75 (scanner94+fecho95 sintéticos, analysis85, transport85, Panel, Dialog). deno check data-entry + extract-camarim-receipt exit 0. Sem PDF real/fixtures ERP.

## Limitações
PDF só 1 página. Data MM/DD vs DD/MM ambígua vai para manual. Lançamento só EUR. Modelo google/gemini-2.5-flash deprecated no catálogo. Correções não validadas com documento real (nova janela exige autorização).
