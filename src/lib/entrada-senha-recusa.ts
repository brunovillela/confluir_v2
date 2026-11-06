/**
 * Parte pura de lib/entrada-senha.ts (sem "server-only", para o teste de
 * unidade). Traduz a recusa do Supabase numa entrada por senha.
 */

export const ERRO_HUMANO =
  "Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo."

type RecusaAuth = { code?: string; status?: number; message?: string }

/**
 * null = é mesmo senha errada (quem chama mostra "incorretos" e conta a
 * falha). Texto = outro motivo, que não conta para o bloqueio.
 */
export function mensagemDaRecusa(error: RecusaAuth): string | null {
  const codigo = error.code ?? ""
  if (codigo === "invalid_credentials" || /invalid login credentials/i.test(error.message ?? "")) {
    return null
  }
  // Conta banida: mesma resposta de senha errada (não revela o estado da conta).
  if (codigo === "user_banned") return null
  if (codigo === "captcha_failed") return ERRO_HUMANO
  if (codigo === "email_not_confirmed") {
    return "Esta conta ainda não foi ativada. Use o link do convite que chegou por e-mail ou “Esqueci minha senha”."
  }
  if (error.status === 429 || codigo.startsWith("over_")) {
    return "Muitas tentativas de acesso agora. Aguarde um minuto e tente de novo."
  }
  return "Não foi possível entrar agora, por uma falha de comunicação. Tente de novo em instantes."
}
