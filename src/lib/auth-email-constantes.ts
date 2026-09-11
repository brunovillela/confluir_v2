/**
 * Validade dos links e códigos que o Supabase Auth manda por e-mail (convite,
 * redefinição de senha, link mágico do portal, código de 6 dígitos).
 *
 * O valor REAL mora no painel do Supabase: Authentication → Sign In /
 * Providers → Email → "Email OTP Expiration". Esta constante só ESPELHA esse
 * número para os e-mails e as telas poderem citá-lo. Mudou lá, mude aqui.
 *
 * 11/09/2026: 7200 s (era 3600; usuários recebiam convite já vencido).
 *
 * Client-safe: sem "server-only", usado também nas telas de login.
 */
export const VALIDADE_LINK_EMAIL_SEGUNDOS = 7200

/** 7200 → "2 horas"; 3600 → "1 hora"; 900 → "15 minutos". */
export function textoValidade(
  segundos: number = VALIDADE_LINK_EMAIL_SEGUNDOS
): string {
  if (segundos % 3600 === 0) {
    const h = segundos / 3600
    return h === 1 ? "1 hora" : `${h} horas`
  }
  const m = Math.round(segundos / 60)
  return m === 1 ? "1 minuto" : `${m} minutos`
}

/**
 * Por que um link de e-mail foi recusado. Vira o parâmetro `?erro=link_<motivo>`
 * que a rota /auth/confirm devolve às telas de login.
 */
export type MotivoRecusaLink =
  | "expirado"
  | "usado"
  | "outro_navegador"
  | "limite"
  | "invalido"

/**
 * Mensagem da tela de login para o `?erro=link_*`. `destino` muda só a
 * instrução de como pedir outro link. Devolve undefined para erros que não
 * são de link.
 */
export function mensagemLinkRecusado(
  erroParam: string | undefined,
  destino: "painel" | "portal"
): string | undefined {
  const pedirNovo =
    destino === "portal"
      ? "Informe seu CPF abaixo para receber um novo link."
      : "Peça um novo em “Esqueci minha senha”."
  switch (erroParam) {
    case "link_expirado":
      return `Este link passou do prazo de ${textoValidade()}. ${pedirNovo}`
    case "link_usado":
      return `Este link já foi usado ou foi substituído por um pedido mais recente. Cada link funciona uma única vez. ${pedirNovo}`
    case "link_outro_navegador":
      return `Abra o link no mesmo navegador em que fez o pedido. ${pedirNovo}`
    case "link_limite":
      return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."
    case "link_invalido":
      return `O link de acesso é inválido ou expirou. ${pedirNovo}`
    default:
      return undefined
  }
}

/**
 * Link de convite/redefinição a partir do generateLink do Supabase.
 *
 * NÃO usar `properties.action_link`: ele passa pelo /verify do Supabase, que
 * (sem PKCE, caso do generateLink) devolve a sessão no FRAGMENTO da URL
 * (#access_token=…). O servidor nunca vê o fragmento, então /auth/confirm
 * recusava o link mesmo novo. Montando com `hashed_token`, o link cai direto
 * em /auth/confirm → verifyOtp, e o diagnóstico de recusa funciona.
 */
export function linkConfirmacaoEmail(
  origem: string,
  props: { hashed_token?: string; verification_type?: string } | null | undefined,
  next = "/definir-senha"
): string | undefined {
  if (!props?.hashed_token || !props.verification_type) return undefined
  const q = new URLSearchParams({
    token_hash: props.hashed_token,
    type: props.verification_type,
    next,
  })
  return `${origem}/auth/confirm?${q.toString()}`
}
