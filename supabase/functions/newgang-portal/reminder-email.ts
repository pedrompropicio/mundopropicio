// Lembrete de confirmação do Clube Newgang — HTML do criativo aprovado pelo Pedro (24/10/2026), marcas substituídas.
// Ficheiro próprio: o clubEmail (boas-vindas/acesso) não muda. lang pt-PT só aqui.
export const REMINDER_SUBJECT = "Falta 1 clique para entrares no Clube Newgang";
export const REMINDER_HEADER_BASE = "https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang";
const LOGO = "https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang/logo-newgang-producoes-branco.png";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export const REMINDER_TEMPLATE = `<!DOCTYPE html><html lang="pt-PT" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Falta 1 clique para entrares no Clube Newgang</title><!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet"><!--<![endif]--><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;display:block}body{margin:0!important;padding:0!important;width:100%!important;background:#0b1f14}a{color:#3ddc6f}@media screen and (max-width:620px){.wrap{width:100%!important}.pad{padding-left:22px!important;padding-right:22px!important}.h1{font-size:30px!important;line-height:36px!important}.txt{font-size:17px!important;line-height:26px!important}.btn a{display:block!important;padding:16px 20px!important;font-size:16px!important}}</style></head><body style="margin:0;padding:0;background:#0b1f14;"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Confirma o teu e-mail e garante o acesso aos benefícios do Clube.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b1f14;"><tr><td align="center" style="padding:24px 10px;"><table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#0b1f14;"><tr><td><img src="{{URL_CABECALHO}}/NG_clube_lembrete_B_1200.jpg" width="600" height="360" alt="Clube Newgang — Falta 1 clique: confirma o teu e-mail para teres acesso ao lote promocional exclusivo." style="width:100%;max-width:600px;height:auto;display:block;border-radius:12px;background:#0b1f14;color:#3ddc6f;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;"></td></tr><tr><td class="pad" style="padding:32px 40px 8px 40px;font-family:'Barlow Condensed',Arial Narrow,Arial,Helvetica,sans-serif;"><h1 class="h1" style="margin:0 0 16px 0;font-family:'Anton','Barlow Condensed',Impact,Arial,sans-serif;font-size:34px;line-height:40px;font-weight:normal;letter-spacing:0.5px;color:#3ddc6f;text-transform:uppercase;">Falta 1 clique</h1><p class="txt" style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:26px;color:#eef5ef;">Olá{{NOME_OPCIONAL}},</p><p class="txt" style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:26px;color:#eef5ef;">Inscreveste-te no <strong style="color:#ffffff;">Clube Newgang</strong>, mas o teu e-mail ainda não está confirmado.</p><p class="txt" style="margin:0 0 26px 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:26px;color:#eef5ef;">Falta 1 clique para entrares no Clube e teres acesso aos benefícios, incluindo a compra no <strong style="color:#3ddc6f;">lote promocional exclusivo</strong>.</p></td></tr><tr><td class="pad" align="center" style="padding:0 40px 28px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn"><tr><td align="center" bgcolor="#3ddc6f" style="border-radius:10px;background:#3ddc6f;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{LINK_CONFIRMACAO}}" style="height:56px;v-text-anchor:middle;width:340px;" arcsize="18%" stroke="f" fillcolor="#3ddc6f"><w:anchorlock/><center style="color:#0b1f14;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">CONFIRMAR O MEU E-MAIL</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="{{LINK_CONFIRMACAO}}" target="_blank" style="display:inline-block;padding:18px 38px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;letter-spacing:0.5px;color:#0b1f14;text-decoration:none;white-space:nowrap;border-radius:10px;background:#3ddc6f;">CONFIRMAR O MEU E-MAIL</a><!--<![endif]--></td></tr></table></td></tr><tr><td class="pad" style="padding:0 40px 30px 40px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#9fb8a7;">Se o botão não funcionar, copia e cola este link no teu navegador:<br><a href="{{LINK_CONFIRMACAO}}" target="_blank" style="color:#3ddc6f;word-break:break-all;">{{LINK_CONFIRMACAO}}</a></td></tr><tr><td class="pad" style="padding:0 40px;"><div style="height:1px;line-height:1px;font-size:1px;background:#1f3d2a;">&nbsp;</div></td></tr><tr><td class="pad" style="padding:22px 40px 8px 40px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#9fb8a7;">Recebeste este e-mail porque te inscreveste no Clube Newgang. Se não foste tu, podes ignorar esta mensagem.</td></tr><tr><td align="center" style="padding:22px 40px 34px 40px;">{{RODAPE_ATUAL_LOGO_NEWGANG_PRODUCOES}}</td></tr></table></td></tr></table></body></html>`;

/** Rodapé atual do Clube (logo Newgang Produções + Cancelar a subscrição). A frase "Recebeste este e-mail..." já está no
 *  corpo do criativo, por isso não é repetida aqui. */
function footer(unsubscribeUrl: string) {
  return `<img src="${LOGO}" width="140" alt="Newgang Produções" style="display:inline-block;width:140px;height:auto;border:0;margin-bottom:12px;">` +
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#7fa58c;">` +
    `<a href="${esc(unsubscribeUrl)}" style="color:#9cc3aa;text-decoration:underline;">Cancelar a subscrição</a></p>`;
}

export function reminderEmail(o: { firstName: string | null; link: string; unsubscribeUrl: string; headerBase?: string }): { html: string; text: string } {
  const name = (o.firstName ?? "").trim();
  const link = esc(o.link);
  const html = REMINDER_TEMPLATE
    .split("{{URL_CABECALHO}}").join(o.headerBase ?? REMINDER_HEADER_BASE)
    .split("{{LINK_CONFIRMACAO}}").join(link)
    .split("{{NOME_OPCIONAL}}").join(name ? " " + esc(name) : "")
    .split("{{RODAPE_ATUAL_LOGO_NEWGANG_PRODUCOES}}").join(footer(o.unsubscribeUrl));
  if (html.includes("{{")) throw new Error("reminder_template_unresolved");
  const text = [
    "Falta 1 clique", "",
    `Olá${name ? " " + name : ""},`, "",
    "Inscreveste-te no Clube Newgang, mas o teu e-mail ainda não está confirmado.", "",
    "Falta 1 clique para entrares no Clube e teres acesso aos benefícios, incluindo a compra no lote promocional exclusivo.", "",
    `Confirmar o meu e-mail: ${o.link}`, "",
    "Recebeste este e-mail porque te inscreveste no Clube Newgang. Se não foste tu, podes ignorar esta mensagem.", "",
    `Cancelar a subscrição: ${o.unsubscribeUrl}`,
  ].join("\n");
  return { html, text };
}
