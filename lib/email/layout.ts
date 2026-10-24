import { SITE_URL } from "../../app/config/site.ts";

// Barvy webu (tailwind.config.ts) — e-mailoví klienti neumí CSS proměnné
// ani Tailwind, proto inline styly a jednoduchá tabulková kostra.
const INK = "#293244";
const MUTED = "#5b6475";
const BRAND = "#6558b4";
const CREAM = "#faf9f6";
const LAVENDER = "#ede9fa";
const LINE = "#e7e3f3";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const emailStyles = { INK, MUTED, BRAND, CREAM, LAVENDER, LINE };

export function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 22px;border-radius:12px">${escapeHtml(label)}</a>`;
}

/** Společná kostra e-mailů: krémové pozadí, bílá karta, patička s odkazem na web. */
export function emailLayout(params: { preheader: string; heading: string; body: string }): string {
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(params.heading)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 8px 16px;font-size:18px;font-weight:700;color:${BRAND}">hlasuju.cz</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:20px;padding:28px 24px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">${escapeHtml(params.heading)}</h1>
${params.body}
</td></tr>
<tr><td style="padding:16px 8px;font-size:12px;line-height:1.5;color:${MUTED}">Tento e-mail jste dostali, protože jste na <a href="${SITE_URL}" style="color:${MUTED}">hlasuju.cz</a> vytvořili hlasování a vyplnili svou adresu. Další e-maily posíláme jen na vaši žádost.</td></tr>
</table></td></tr></table>
</body></html>`;
}
