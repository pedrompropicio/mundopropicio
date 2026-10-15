# Issue #320 — prova build (2026-10-15, base a27eb09b2f8eaa42a078bcecd3cd96387f56b832)

Comando: `bunx vite build`  
Exit code: 0  
Ambiente: bun 1.3.3, vitest 3.2.7, node v22.22.0. Sem rede para a Meta (fetch bloqueado nos testes CAPI).

```text
dist/assets/BankReconciliation-D_hp5S-z.js                      81.01 kB │ gzip:  23.08 kB
dist/assets/CardSessionDetail-4bez_cnn.js                       86.83 kB │ gzip:  22.99 kB
dist/assets/jszip.min-DjaQLip6.js                               97.24 kB │ gzip:  30.05 kB
dist/assets/EventImplementationDetail-CcxN2MPu.js              110.42 kB │ gzip:  29.32 kB
dist/assets/ReportPaymentListsPage-6f4Frac9.js                 125.00 kB │ gzip:  33.80 kB
dist/assets/Campaigns-BxDIo6T6.js                              127.24 kB │ gzip:  34.28 kB
dist/assets/ticket-office-settlement-form-BkZdEETj.js          129.28 kB │ gzip:  35.67 kB
dist/assets/EventSimulator-CeI7CT2f.js                         145.00 kB │ gzip:  37.46 kB
dist/assets/Transactions-B4YXbdRM.js                           147.79 kB │ gzip:  38.60 kB
dist/assets/index.es-C-gnJdc0.js                               150.74 kB │ gzip:  51.38 kB
dist/assets/TicketOffices-YaRnJNXA.js                          167.94 kB │ gzip:  43.19 kB
dist/assets/TransactionEditModal-CyNjU9bb.js                   198.63 kB │ gzip:  48.63 kB
dist/assets/html2canvas.esm-CBrSDip1.js                        201.42 kB │ gzip:  47.70 kB
dist/assets/vendor-supabase-C83P-B5T.js                        209.56 kB │ gzip:  54.23 kB
dist/assets/CampaignView-BDUGGFk-.js                           222.38 kB │ gzip:  57.73 kB
dist/assets/vendor-react-DYLj_lXh.js                           227.69 kB │ gzip:  71.86 kB
dist/assets/EventForecast-B1l-a52o.js                          409.71 kB │ gzip: 105.80 kB
dist/assets/vendor-pdf-DR7krn7Q.js                             421.80 kB │ gzip: 137.18 kB
dist/assets/vendor-charts-BdNZb--m.js                          434.16 kB │ gzip: 114.66 kB
dist/assets/pdf-first-page-to-jpeg-M5CLsCvW.js                 458.53 kB │ gzip: 135.85 kB
dist/assets/EventDetail-DRF0U3nO.js                            592.74 kB │ gzip: 150.88 kB
dist/assets/index-Ch3R_mKr.js                                  824.07 kB │ gzip: 234.89 kB
dist/assets/vendor-ui-BwmvK_hi.js                            1,067.56 kB │ gzip: 220.12 kB
dist/assets/heic2any-DZzk1OQ_.js                             1,352.85 kB │ gzip: 341.38 kB
dist/assets/vendor-xlsx-BK2YhLPP.js                          1,369.76 kB │ gzip: 412.26 kB
dist/assets/vendor-handsontable-Dd3DQzR3.js                  1,906.58 kB │ gzip: 453.88 kB
dist/assets/heic-to-lXPrQE7P.js                              2,995.46 kB │ gzip: 736.99 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 54.47s

PWA v1.3.0
mode      generateSW
precache  343 entries (18838.23 KiB)
files generated
  dist/sw.js
  dist/workbox-7caff1f5.js
```
