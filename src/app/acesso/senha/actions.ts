"use server"

import { createHash } from "node:crypto"

import type { EmailOtpType, User } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { diagnosticarLinkRecusado, registrarLinkAceito } from "@/lib/auth-diagnostico"
import { textoValidade, VALIDADE_LINK_EMAIL_SEGUNDOS } from "@/lib/auth-email-constantes"
import { descreveErroAuth } from "@/lib/contas"
import { mensagemSenhaRecusada } from "@/lib/senha-recusa"
import { createClient } from "@/lib/supabase/server"

const TIPOS: EmailOtpType[] = ["invite", "recovery", "signup", "magiclink", "email"]

/**
 * Cookie com o hash do link que ESTE navegador já gastou. O link é conferido
 * (verifyOtp) antes de a senha ser gravada; se a senha é recusada, a nova
 * tentativa com o mesmo link reaproveita a sessão aberta por ele. Só o hash
 * fica no cookie — e o link já gasto não serve para mais nada.
 */
const COOKIE_LINK = "confluir_link_senha"
const marcaDoLink = (tokenHash: string) => createHash("sha256").update(tokenHash).digest("hex")

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
  const jar = await cookies()
  const marca = marcaDoLink(tokenHash)
  let user: User | null = null

  // Nova tentativa com o MESMO link, depois de a senha anterior ter sido
  // recusada: o link já foi gasto (abriu a sessão) — segue com essa sessão em
  // vez de mandar pedir outro link (caso de 09/11/2026).
  if (jar.get(COOKIE_LINK)?.value === marca) {
    const { data: atual } = await supabase.auth.getUser()
    user = atual.user
  }

  if (!user) {
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
    user = data.user
    // Este navegador gastou este link: vale para repetir a senha até o prazo do link.
    jar.set(COOKIE_LINK, marca, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/acesso/senha",
      maxAge: VALIDADE_LINK_EMAIL_SEGUNDOS,
    })
  }

  const { error: erroSenha } = await supabase.auth.updateUser({ password: senha })
  if (erroSenha) {
    console.error("[acesso/senha] senha recusada:", descreveErroAuth(erroSenha))
    // O link continua valendo NESTA tela (cookie acima): basta escolher outra senha.
    return { erro: mensagemSenhaRecusada(erroSenha as Parameters<typeof mensagemSenhaRecusada>[0]) }
  }
  jar.delete({ name: COOKIE_LINK, path: "/acesso/senha" })

  const destino = destinoPedido.startsWith("/") && !destinoPedido.startsWith("//")
    ? destinoPedido
    : destinoDaConta(user.user_metadata?.tipo)
  redirect(destino)
}
