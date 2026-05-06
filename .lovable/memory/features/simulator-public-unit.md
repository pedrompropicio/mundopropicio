---
name: Simulator public unit (Presenças×dia)
description: Simulador unifica público em "Presenças × dia" (1 Passe N dias = N), eliminando "Bilhetes únicos"
type: feature
---

Decisão (2026-05-06): no Simulador (Dashboard executivo, KPIs por pessoa,
A&B scaling, BE/Forecast targets), a unidade de público é **sempre Presenças
× dia**.

- 1 Passe 2 dias = 2 presenças (expandido pelo `useEventAttendance` /
  `expandLotSalesToDailyAttendance`).
- KPI grande mudou de "Bilhetes únicos" → "Presenças × dia" em
  `ExecutiveDashboard.tsx`.
- `beTargetQty`/`fcTargetQty` deixaram de usar `solution.totalQty`
  (bilhetes únicos) e passam a usar `attendanceQty + attendanceCourtesyQty`
  do cenário — alinha com a tabela "Público por dia".
- `costPerPerson`/`resultPerPerson` já dividiam por `totalPublic`
  (presenças). Mantém-se.
- A&B `scaleABFromReal` continua a receber `bePubProjected/fcPubProjected`
  em presenças (já estava certo desde fix anterior).

Não confundir com a Bilheteira / Reports onde "Bilhetes vendidos" continua
a contar 1 ingresso = 1 (unidade comercial).
