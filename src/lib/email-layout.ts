/**
 * Moldura visual dos e-mails do Confluir.
 *
 * Usada em dois lugares, por isso NÃO tem imports:
 *  - src/lib/email.ts embrulha todo e-mail que o app manda pelo Brevo;
 *  - scripts/gerar-templates-email.mjs gera os modelos do Supabase Auth
 *    (Node puro importa este .ts direto, sem o alias "@/").
 *
 * Regras de e-mail (valem para qualquer mudança aqui):
 *  - layout em <table> e estilo INLINE: Gmail e Outlook descartam boa parte
 *    do CSS de <style>; o <style> do <head> é só reforço (links, celular);
 *  - sem web font obrigatória: Poppins onde o cliente tiver, senão Segoe/Arial;
 *  - cores = paleta do design system (src/app/globals.css), em hex;
 *  - botão em laranja escuro (primary-600) com texto branco: contraste AA,
 *    o mesmo do botão primário do tema claro;
 *  - logo claro sobre faixa navy: a faixa escura não é invertida pelo modo
 *    escuro dos clientes de e-mail, e é a mesma cara da barra lateral.
 */

export const COR = {
  laranja: "#FF5722",
  laranjaAcao: "#D73E02",
  laranjaFundo: "#FFF4F1",
  navy: "#091747",
  navyFundo: "#F3F7FF",
  navyBorda: "#CED9F1",
  texto: "#41454D",
  textoSuave: "#72767E",
  fundo: "#F5F7FA",
  borda: "#E9EBEF",
  branco: "#FFFFFF",
}

const FONTE = "Poppins, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const FONTE_MONO =
  "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"

export function escaparHtml(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** Título do e-mail (h1 navy). */
export function tituloEmail(texto: string): string {
  return `<h1 style="margin:0 0 16px;font-family:${FONTE};font-size:22px;line-height:1.3;font-weight:600;color:${COR.navy};">${texto}</h1>`
}

/** Parágrafo de corpo. */
export function paragrafo(html: string): string {
  return `<p style="margin:0 0 16px;">${html}</p>`
}

/** Parágrafo menor e cinza (observações, "se não foi você…"). */
export function textoSuave(html: string): string {
  return `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${COR.textoSuave};">${html}</p>`
}

/** Botão de ação "à prova de bala" (tabela + link), funciona no Outlook. */
export function botaoEmail(href: string, rotulo: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:separate;">
<tr><td align="center" bgcolor="${COR.laranjaAcao}" style="border-radius:8px;background-color:${COR.laranjaAcao};">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONTE};font-size:15px;font-weight:600;line-height:20px;color:${COR.branco};text-decoration:none;border-radius:8px;">${rotulo}</a>
</td></tr>
</table>`
}

/** Endereço por extenso, para quando o botão não abre. */
export function linkReserva(href: string): string {
  return `<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:${COR.textoSuave};">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${href}" style="color:${COR.laranjaAcao};word-break:break-all;">${href}</a></p>`
}

/** Caixa de destaque com borda laranja (prazo, atenção). */
export function caixaAviso(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
<tr><td style="background-color:${COR.laranjaFundo};border-left:4px solid ${COR.laranja};border-radius:6px;padding:14px 16px;font-family:${FONTE};font-size:13px;line-height:1.5;color:${COR.texto};">${html}</td></tr>
</table>`
}

/** Código de acesso grande, fácil de ler e de copiar. */
export function caixaCodigo(codigo: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">
<tr><td align="center" style="background-color:${COR.navyFundo};border:1px solid ${COR.navyBorda};border-radius:10px;padding:20px 16px;">
<div style="font-family:${FONTE};font-size:12px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:${COR.textoSuave};margin:0 0 6px;">Seu código</div>
<div style="font-family:${FONTE_MONO};font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:${COR.navy};">${codigo}</div>
</td></tr>
</table>`
}

/**
 * Documento completo: faixa navy com o logo, filete laranja, cartão branco
 * com o corpo e rodapé discreto fora do cartão.
 */
export function layoutEmail(opcoes: {
  corpo: string
  /** URL absoluta do PNG claro do logo (faixa navy). */
  logoUrl: string
  /** Texto de pré-visualização na caixa de entrada. */
  preheader?: string
  titulo?: string
  /** HTML do rodapé (fora do cartão). */
  rodape?: string
}): string {
  const { corpo, logoUrl, preheader = "", titulo = "Confluir", rodape = "" } =
    opcoes
  // Enchimento invisível: impede o cliente de completar a prévia com o texto
  // do corpo logo depois do preheader.
  const enchimento = "&#847;&zwnj;&nbsp;".repeat(40)
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${titulo}</title>
<style>
  body { margin:0; padding:0; background-color:${COR.fundo}; }
  a { color:${COR.laranjaAcao}; }
  @media (max-width:600px) {
    .cartao { width:100% !important; border-radius:0 !important; }
    .miolo { padding:28px 20px !important; }
    .faixa { padding:18px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COR.fundo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}${enchimento}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COR.fundo};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="cartao" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${COR.branco};border:1px solid ${COR.borda};border-radius:12px;overflow:hidden;">
<tr><td class="faixa" align="left" bgcolor="${COR.navy}" style="background-color:${COR.navy};padding:20px 32px;">
<img src="${logoUrl}" width="150" height="50" alt="Confluir" style="display:block;border:0;outline:none;text-decoration:none;width:150px;height:50px;">
</td></tr>
<tr><td bgcolor="${COR.laranja}" style="background-color:${COR.laranja};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td class="miolo" style="padding:36px 32px 20px;font-family:${FONTE};font-size:15px;line-height:1.6;color:${COR.texto};">
${corpo}
</td></tr>
</table>
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td align="center" style="padding:18px 24px 0;font-family:${FONTE};font-size:12px;line-height:1.5;color:${COR.textoSuave};">${rodape}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
