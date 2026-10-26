import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reminderEmail } from "../../supabase/functions/newgang-portal/reminder-email.ts";
import { clubEmail } from "../../supabase/functions/newgang-portal/email.ts";
import { PRIVACY_URL } from "../../supabase/functions/newgang-portal/legal-footer.ts";

const UNSUB = "https://mundopropicio.com/descadastrar?token=tok_ficticio";
const CONTROLLER = "Responsável pelo tratamento: Mundo Propício Unipessoal, Lda · NIPC 515274291";
const ADDRESS = "Rua Prista Monteiro 13B, 1600-792 Lisboa, Portugal · geral@mundopropicio.com";
const NOTICE = "Recebeste este e-mail porque te inscreveste no Clube Newgang. Se não foste tu, podes ignorar esta mensagem.";

const order = (s: string, parts: string[]) => {
  const idx = parts.map((p) => s.indexOf(p));
  idx.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
  expect([...idx].sort((a, b) => a - b)).toEqual(idx);
};

describe("#367 rodapé legal", () => {
  it("lembrete: aviso, logos, responsável, morada, política e cancelar por esta ordem", () => {
    const { html, text } = reminderEmail({ firstName: "Teste", link: "https://x/l", unsubscribeUrl: UNSUB });
    order(html, [NOTICE, "logo-mundo-propicio.png", "logo-newgang-producoes-branco.png", CONTROLLER, ADDRESS,
      `href="${PRIVACY_URL}"`, "Política de Privacidade", `href="${UNSUB}"`, "Cancelar a subscrição"]);
    order(text, [NOTICE, CONTROLLER, ADDRESS, PRIVACY_URL, `Cancelar a subscrição: ${UNSUB}`]);
    expect(html).not.toContain("{{");
    expect(PRIVACY_URL).toBe("https://mundopropicio.com/pt/privacidade");
  });

  it("boas-vindas mantém cancelar e ganha a identificação", () => {
    const { html, text } = clubEmail({ greet: "Olá,", lines: ["x"], cta: "c", link: "https://x/l", note: "n", unsubscribeUrl: UNSUB });
    order(html, [CONTROLLER, ADDRESS, "Política de Privacidade", "Cancelar a subscrição"]);
    expect(text).toContain(`Cancelar a subscrição: ${UNSUB}`);
  });

  it("transacional (acesso) sem cancelar, só identificação", () => {
    const { html, text } = clubEmail({ greet: "Olá,", lines: ["x"], cta: "c", link: "https://x/l", note: "n", unsubscribeUrl: null });
    expect(html).toContain(CONTROLLER);
    expect(html).not.toContain("Cancelar a subscrição");
    expect(text).not.toContain("Cancelar");
  });
});

describe("#367 cabeçalhos List-Unsubscribe", () => {
  const idx = readFileSync("supabase/functions/newgang-portal/index.ts", "utf8");
  const q = readFileSync("supabase/functions/process-email-queue/index.ts", "utf8");
  it("fila envia One-Click a partir de unsubscribe_http_url, uma única vez", () => {
    expect(q.match(/'List-Unsubscribe':/g)?.length).toBe(1);
    expect(q).toContain("'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'");
  });
  it("acesso não leva unsubscribe_http_url; lembrete/boas-vindas levam o one-click por destinatário", () => {
    expect(idx).toContain('...(kind === "access" ? {} : { unsubscribe_http_url: unsub.oneClick })');
    expect(idx).toContain("handle-email-unsubscribe?token=${encodeURIComponent(token)}");
  });
});
