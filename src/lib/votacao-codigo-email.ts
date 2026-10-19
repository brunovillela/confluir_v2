/**
 * Código que confirma o e-mail de votação no portal (VOT-08; R-2 de
 * docs/produto/regras-negocio.md). Um lugar só para a validade, que o envio
 * (lib/db/votacao-portal) e o limite de envio (app/portal/votacao/
 * limite-envio-codigo) precisam ler igual: o intervalo entre envios é contado
 * pelo vencimento do código pendente menos esta validade.
 */
export const CODIGO_EMAIL_VOTACAO_VALIDADE_MIN = 15

/**
 * Erros aceitos por código. Com 6 dígitos e sem limite, dava para chutar à
 * vontade nos 15 min (V3 da RIPD da votação). Esgotadas, o código morre e é
 * preciso pedir outro, que tem o seu próprio limite de envio.
 */
export const CODIGO_EMAIL_VOTACAO_MAX_TENTATIVAS = 5
