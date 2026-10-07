"use server"

import { redirect } from "next/navigation"

import { identidadeDaConta } from "@/lib/auth-identidade"
import { diagnosticarCodigoRecusado } from "@/lib/auth-diagnostico"
import { mascararEmail, type EstadoForm } from "@/lib/contas"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { exigirHumano } from "@/lib/turnstile"

/**
 * Link único de votação (/votar) — ver lib/db/votacao-link-unico.ts.
 * Passo 1: confirmar um e-mail que a pessoa recebe (código + link pelo canal
 * do app). Passo 2: vincular-se ao registro da lista pelos dados. Passo 3:
 * abrir a cédula de cada votação pela sessão do apto (a mesma do link
 * pessoal).
 */

/** Tentativas de cadastro que não conferem, por conta, antes de travar. */
const MAX_FALHAS = 5

/**
 * Estado do passo 1. `corporativo` = o e-mail é de empresa das listas (o
 * filtro dela retém o código); `sugestao` = parece erro de digitação.
 */
export type EstadoEntrar = EstadoForm & {
  corporativo?: { email: string; temLink: boolean }
  sugestao?: { email: string; digitado: string }
  /** Link pessoal reenviado ao e-mail da empresa. */
  linkEnviado?: boolean
}

export async function solicitarCodigoLinkUnico(
  _prev: EstadoEntrar,
  formData: FormData
): Promise<EstadoEntrar> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: "Informe um e-mail válido." }

  // As conferências de domínio não enviam nada: vêm ANTES do "sou humano",
  // que só vale uma vez — quem corrige o e-mail não esbarra num token gasto.
  // Nenhuma delas diz se o e-mail está na lista (isso só depois da conferência).
  const { dominioRecebeEmail, dominiosCorporativosAbertos, PROVEDORES_PESSOAIS, sugerirDominio } = await import(
    "@/lib/db/votacao-link-unico"
  )
  const [usuario, dominio] = email.split("@")
  const corporativos = await dominiosCorporativosAbertos()

  // E-mail da empresa: o filtro corporativo retém o código. Não manda.
  if (corporativos.has(dominio)) return { corporativo: { email, temLink: true } }

  // Erro de digitação no domínio ("gmial.com", "bakerhuhes.com").
  const forcar = String(formData.get("forcar") ?? "") === "1"
  const sugerido = sugerirDominio(dominio, [...PROVEDORES_PESSOAIS, ...corporativos])
  if (!(await dominioRecebeEmail(dominio))) {
    return sugerido
      ? { erro: `O endereço “${dominio}” não recebe e-mails.`, sugestao: { email: `${usuario}@${sugerido}`, digitado: email } }
      : { erro: `O endereço “${dominio}” não recebe e-mails. Confira o que foi digitado depois do @.` }
  }
  if (sugerido && !forcar) return { sugestao: { email: `${usuario}@${sugerido}`, digitado: email } }

  const erroHumano = await exigirHumano(formData)
  if (erroHumano) return { erro: erroHumano }

  const { enviarCodigoAcesso } = await import("@/lib/codigo-acesso")
  const { erro } = await enviarCodigoAcesso({
    email,
    metadata: { tipo: "eleitor" },
    next: "/votar",
    contexto: "Use o código abaixo para confirmar o seu e-mail e ver as votações abertas.",
  })
  if (erro) return { erro }
  return { ok: `Código enviado para ${mascararEmail(email)}. Digite-o abaixo.` }
}

/**
 * Quem insiste no e-mail da empresa recebe o AVISO com o link pessoal de
 * voto — o formato que passa pelos filtros corporativos (o do código, não).
 */
export async function enviarLinkAoEmailDaEmpresa(
  _prev: EstadoEntrar,
  formData: FormData
): Promise<EstadoEntrar> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const erroHumano = await exigirHumano(formData)
  if (erroHumano) return { erro: erroHumano, corporativo: { email, temLink: true } }
  const { aptosAbertosPorEmail } = await import("@/lib/db/votacao-link-unico")
  const aptos = (await aptosAbertosPorEmail(email)).slice(0, 3)
  if (aptos.length === 0) {
    return {
      erro: "Este e-mail não está na lista de aptos das votações abertas. Use um e-mail pessoal.",
      corporativo: { email, temLink: false },
    }
  }
  const { enviarLinkDeVoto } = await import("@/lib/db/votacao-aviso")
  let enviados = 0
  for (const a of aptos) {
    const { erro } = await enviarLinkDeVoto(a.assembleiaId, { id: a.aptoId, nome: a.nome, email })
    if (!erro) enviados++
  }
  if (enviados === 0) {
    return { erro: "Não foi possível enviar agora. Tente de novo ou use um e-mail pessoal.", corporativo: { email, temLink: true } }
  }
  return { linkEnviado: true, ok: `Enviamos o seu link de votação para ${mascararEmail(email)}.` }
}

export async function confirmarCodigoLinkUnico(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const token = String(formData.get("token") ?? "").trim()
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" })
  if (error) {
    return { erro: await diagnosticarCodigoRecusado({ erro: error, email, token, fluxo: "votacao_link_unico" }) }
  }
  redirect("/votar")
}

export type EstadoCadastroLinkUnico = EstadoForm & {
  valores?: { cpf: string; nome: string; nascimento: string; email_empresa: string }
  tentativa?: number
}

export async function cadastrarNoLinkUnico(
  prev: EstadoCadastroLinkUnico,
  formData: FormData
): Promise<EstadoCadastroLinkUnico> {
  const valores = {
    cpf: String(formData.get("cpf") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    nascimento: String(formData.get("nascimento") ?? ""),
    email_empresa: String(formData.get("email_empresa") ?? ""),
  }
  const falha = (erro: string): EstadoCadastroLinkUnico => ({
    erro,
    valores,
    tentativa: (prev.tentativa ?? 0) + 1,
  })

  // O e-mail vem da SESSÃO (código conferido), nunca do formulário.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return falha("Sessão expirada. Confirme o seu e-mail de novo.")

  const falhas = Number((user.app_metadata as Record<string, unknown> | undefined)?.link_unico_falhas ?? 0)
  if (falhas >= MAX_FALHAS) {
    return falha("Muitas tentativas que não conferem. Procure o sindicato para liberar o seu voto.")
  }

  const { vincularPorLinkUnico } = await import("@/lib/db/votacao-link-unico")
  const r = await vincularPorLinkUnico({
    emailSessao: user.email,
    cpf: valores.cpf,
    nome: valores.nome,
    nascimento: valores.nascimento,
    emailEmpresa: valores.email_empresa,
  })
  if (r.erro) {
    // Conta só a tentativa que chegou à conferência (erro de formato não conta).
    if (r.naoConferiu) {
      const admin = await createAdminClient()
      await admin.auth.admin
        .updateUserById(user.id, {
          app_metadata: { ...(user.app_metadata ?? {}), link_unico_falhas: falhas + 1 },
        })
        .catch(() => undefined)
    }
    return falha(r.erro)
  }
  redirect("/votar?cadastro=1")
}

/** Abre a cédula de uma votação pela sessão do apto (a mesma do link pessoal). */
export async function abrirCedulaLinkUnico(formData: FormData): Promise<void> {
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !assembleiaId) redirect("/votar")

  const identidade = await identidadeDaConta(user.id)
  const cpf = identidade?.tipo === "filiado" ? identidade.cpf : null
  const { votacoesAbertas, vinculosDaSessao } = await import("@/lib/db/votacao-link-unico")
  const votacao = (await votacoesAbertas()).find((v) => v.assembleiaId === assembleiaId)
  if (!votacao) redirect("/votar")
  const vinculo = (await vinculosDaSessao({ email: user.email ?? null, cpf }, [votacao])).get(assembleiaId)
  if (!vinculo) redirect("/votar")

  const { abrirSessaoPorLink } = await import("@/lib/acesso-eleitor")
  await abrirSessaoPorLink(vinculo.aptoId, assembleiaId)
  redirect(`/votar/${assembleiaId}`)
}

export async function sairLinkUnico(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const { encerrarSessaoPorLink } = await import("@/lib/acesso-eleitor")
  await encerrarSessaoPorLink()
  redirect("/votar")
}
