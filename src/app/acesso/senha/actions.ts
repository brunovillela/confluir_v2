"use server"

import type { EmailOtpType } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { diagnosticarLinkRecusado, registrarLinkAceito } from "@/lib/auth-diagnostico"
import { textoValidade } from "@/lib/auth-email-constantes"
import { createClient } from "@/lib/supabase/server"

const TIPOS: EmailOtpType[] = ["invite", "recovery", "signup", "magiclink", "email"]

/** Destino por tipo de conta (o mesmo de /definir-senha). */
function destinoDaConta(tipo: unknown): string {
  return tipo === "filiado" ? "/portal/inicio" : tipo === "hotel" ? "/hotel/inicio" : "/painel"
}

/**
 * Cria a senha a partir do link: SÓ AQUI o código de uso único é conferido
 * (verifyOtp abre a sessão) e a senha é gravada. Abrir a página não gasta
 * nada — por isso pré-visualização de WhatsApp e robôs de e-mail não matam
 * mais o link.
 */
export async function criarSenhaPeloLink(
  _prev: { erro?: string },
  fd: FormData
): Promise<{ erro?: string }> {
  const tokenHash = String(fd.get("token_hash") ?? "")
  const tipo = String(fd.get("type") ?? "") as EmailOtpType
  const destinoPedido = String(fd.get("destino") ?? "")
  const senha = String(fd.get("senha") ?? "")
  const confirmacao = String(fd.get("confirmacao") ?? "")

  if (!tokenHash || !TIPOS.includes(tipo)) {
    return { erro: "Link inválido. Peça um novo link de acesso." }
  }
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." }
  if (senha !== confirmacao) return { erro: "As senhas não conferem." }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
  if (error || !data.user) {
    const motivo = await diagnosticarLinkRecusado({
      erro: error ?? { message: "sem usuário" },
      fluxo: "token_hash",
      tipo,
      tokenHash,
    })
    const pedirNovo = "Peça um novo link a quem enviou o acesso (ou use “Esqueci minha senha” na tela de entrada)."
    return {
      erro:
        motivo === "expirado"
          ? `Este link passou do prazo de ${textoValidade()}. ${pedirNovo}`
          : motivo === "usado"
            ? `Este link já foi usado ou foi substituído por um mais recente — cada link funciona uma vez só. ${pedirNovo}`
            : motivo === "limite"
              ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."
              : `Link de acesso inválido. ${pedirNovo}`,
    }
  }
  registrarLinkAceito(tipo, null)

  const { error: erroSenha } = await supabase.auth.updateUser({ password: senha })
  if (erroSenha) {
    return {
      erro: /different from the old|same/i.test(erroSenha.message)
        ? "A nova senha precisa ser diferente da anterior."
        : "Não foi possível salvar a senha. Tente novamente.",
    }
  }

  const destino = destinoPedido.startsWith("/") && !destinoPedido.startsWith("//")
    ? destinoPedido
    : destinoDaConta(data.user.user_metadata?.tipo)
  redirect(destino)
}
