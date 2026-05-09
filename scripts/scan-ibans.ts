import fs from "node:fs";
import { validateIban, ibanWarningMessage, normalizeIban } from "../src/lib/iban";

const lines = fs.readFileSync("/tmp/ibans.tsv", "utf8").trim().split("\n");
const rows: string[][] = [];
let invalidCount = 0;
let totalIbans = 0;

for (const line of lines) {
  const [id, name, i1, i2, i3] = line.split("\t");
  for (const [slot, raw] of [["iban", i1], ["iban_2", i2], ["iban_3", i3]] as const) {
    if (!raw) continue;
    totalIbans++;
    const c = validateIban(raw);
    if (!c.valid) {
      invalidCount++;
      rows.push([id, name, slot, raw, normalizeIban(raw), c.reason ?? "", ibanWarningMessage(c) ?? ""]);
    }
  }
}

const header = "supplier_id\tname\tslot\toriginal\tnormalized\treason\tmessage\n";
const csv = header + rows.map((r) => r.join("\t")).join("\n") + "\n";
fs.writeFileSync("/mnt/documents/ibans_invalidos.tsv", csv);

console.log(`Fornecedores com IBAN: ${lines.length}`);
console.log(`Total de IBANs: ${totalIbans}`);
console.log(`IBANs inválidos: ${invalidCount}`);
console.log(`Relatório: /mnt/documents/ibans_invalidos.tsv`);
console.log("\n--- Inválidos ---");
for (const r of rows) console.log(r.slice(1, 7).join(" | "));
