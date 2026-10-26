// Emails do Clube Newgang (visual único: cabeçalho, fundo verde escuro, botão verde, rodapé Newgang Produções).
import { legalFooterHtml, legalFooterText } from "./legal-footer.ts";

const HEADER = "https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang/clube-email-header-v3.jpg";
const LOGO = "https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang/logo-newgang-producoes-branco.png";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function clubEmail(o: {
  greet: string; lines: string[]; cta: string; link: string; note: string; unsubscribeUrl: string | null;
}): { html: string; text: string } {
  const p = (t: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#e8f5ec;">${esc(t)}</p>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0b1f14;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td><img src="${HEADER}" width="600" alt="Clube Newgang" style="display:block;width:100%;height:auto;border:0;"></td></tr>
<tr><td style="padding:32px 32px 8px;">
${p(o.greet)}${o.lines.map(p).join("")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:#3ddc6f;border-radius:8px;">
<a href="${esc(o.link)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#06140c;text-decoration:none;">${esc(o.cta)}</a>
</td></tr></table>
<p style="margin:0 0 24px;font-size:13px;line-height:20px;color:#9cc3aa;">${esc(o.note)}</p>
</td></tr>
<tr><td style="padding:24px 32px;border-top:1px solid #1d3a28;text-align:center;">
<img src="${LOGO}" width="140" alt="Newgang Produções" style="display:inline-block;width:140px;height:auto;border:0;margin-bottom:12px;">
${o.unsubscribeUrl ? `<p style="margin:0 0 10px;font-size:12px;line-height:18px;color:#7fa58c;">Recebeste este email porque te inscreveste no Clube Newgang.</p>` : ""}
${legalFooterHtml(o.unsubscribeUrl)}
</td></tr></table></td></tr></table></body></html>`;
  const text = [o.greet, "", ...o.lines, "", `${o.cta}: ${o.link}`, "", o.note, "", ...(o.unsubscribeUrl ? ["Recebeste este email porque te inscreveste no Clube Newgang."] : []), ...legalFooterText(o.unsubscribeUrl)].join("\n");
  return { html, text };
}
