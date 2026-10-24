# Identidades visuais por projeto

Regra: `docs/modelos/README.md` › "Paleta por projeto" (D-ERP303). Um ficheiro por projeto; cada valor tem origem (ficheiro CSS do projeto Lovable, manual de marca ou logo). Sem ficheiro aqui, o relatório sai em `mundo-propicio.md`.

| Ficheiro | Projeto | Usa-se em | Origem |
|---|---|---|---|
| `mundo-propicio.md` | Mundo Propício — corporativa | Relatórios da empresa sem projeto ou com vários projetos (DRE, conciliações, triagem, auditorias transversais) | Portal mundopropicio.com (Lovable 26b95793) `src/styles.css` |
| `mp-gestao-eventos.md` | MP Gestão Eventos (ERP) | Relatórios sobre a plataforma e o ERP (bilheteiras, fechos genéricos, BP, invariantes) | ERP (Lovable ab7cf7e3) `src/index.css` |
| `newgang.md` | Newgang Festival | Tudo do Newgang: fecho, clube, bilheteira, tráfego, extrato de pontos | Portal newgangfestival.pt (Lovable 1a915f50) `src/styles.css` |
| `coala.md` | Coala Festival Portugal | Tudo do Coala: fecho, Early Bird, tráfego, BP | Portal coalafestival.pt (Lovable bef9c59c) `src/styles.css`, que cita o manual de marca |
| `gestao-artistica.md` | Gestão Artística / carreira de artistas | Relatórios de carreira (Litto, Ghanem, Natanzinho…), media kit, tráfego por plataforma | Gestão Artística (Lovable c5fbb3d2) `src/styles.css`, design system "Frequência" |

Faltam, por não terem origem registada: identidade própria de cada artista (logo/manual do artista) — até existir, carreira artística sai em `gestao-artistica.md`.

Como aplicar num relatório (xlsx/pdf/html): fundo = `background`; texto = `foreground`; títulos e número-chave = `primary` (ou `accent` quando o ficheiro o indicar); linhas de tabela e separadores = `border`; legendas e rodapé = `muted`. Uma fonte de corpo, uma de títulos quando o projeto a tiver. Nunca gradientes, sombras ou brilhos, mesmo que o site os use — o relatório é impresso e partilhado.
