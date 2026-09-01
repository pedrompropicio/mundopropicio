// Guarda em runtime contra caracteres invisíveis / decomposição Unicode no
// conteúdo já renderizado dos e-mails transacionais.
//
// Faz apenas o que é seguro em HTML renderizado:
//   - normalização NFC (letra + acento combinante → carácter precomposto)
//   - remoção de U+200B, U+200C, U+200D, U+2060, U+FEFF
//
// NÃO toca em:
//   - U+FE0F (variation selector-16) — é o que faz os emojis renderizarem
//   - U+00A0 — pode ser intencional em HTML/estilos
//   - homoglifos — o HTML contém URLs e tokens; substituir automaticamente parte-os

const INVISIBLES: Array<[string, string]> = [
  ['\u200B', 'U+200B'],
  ['\u200C', 'U+200C'],
  ['\u200D', 'U+200D'],
  ['\u2060', 'U+2060'],
  ['\uFEFF', 'U+FEFF'],
]

export function sanitizeRenderedEmail(input: string): { out: string; findings: string[] } {
  const findings: string[] = []
  let out = input

  const normalized = out.normalize('NFC')
  if (normalized !== out) {
    findings.push('NFC')
    out = normalized
  }

  for (const [ch, label] of INVISIBLES) {
    let count = 0
    for (const c of out) if (c === ch) count++
    if (count > 0) {
      findings.push(`${label} ×${count}`)
      out = out.split(ch).join('')
    }
  }

  return { out, findings }
}
