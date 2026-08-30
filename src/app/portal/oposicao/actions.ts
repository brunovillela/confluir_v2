"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { tenantAtual } from "@/lib/tenant"

import { requireSessaoTrabalhador } from "@/lib/auth"
import {
  buscarFiliadoPorCpf,
  mascararEmail,
  type EstadoForm,
} from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  minhaOposicao,
  obterCampanhaPublica,
  registrarDesistencia,
  registrarOposicao,
  subirDocumentoAssinado,
} from "@/lib/db/oposicao"
import { estadoPrazo, exigeDocumento } from "@/lib/oposicao-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

/** IP e user-agent da requisição, para a trilha de auditoria. */
async function rastro(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  return { ip, ua: h.get("user-agent") }
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

// ── Acesso por CÓDIGO no e-mail (OTP), espelhando o /votar ───────────────────
// Filiado: identifica-se pelo CPF (o código vai ao e-mail cadastrado).
// Trabalhador não-filiado: informa nome, CPF e e-mail (o código vai a esse
// e-mail). O e-mail é verificado pelo OTP; o CPF é a autodeclaração do opositor.

/** Filiado pede o código: CPF → e-mail do cadastro. */
export async function enviarCodigoFiliado(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(texto(fd, "cpf"))
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado || !filiado.email) {
    return {
      erro: "CPF não localizado ou sem e-mail. Use o acesso do trabalhador ao lado.",
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: filiado.email,
    options: { shouldCreateUser: true, data: { tipo: "filiado", cpf } },
  })
  if (error) return { erro: "Não foi possível enviar o código. Tente de novo." }
  return { ok: `Código enviado para ${mascararEmail(filiado.email)}.` }
}

export async function confirmarCodigoFiliado(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(texto(fd, "cpf"))
  const token = texto(fd, "token")
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }
  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado?.email) return { erro: "CPF não localizado." }
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email: filiado.email,
    token,
    type: "email",
  })
  if (error) return { erro: "Código inválido ou expirado." }
  redirect("/portal/oposicao")
}

/** Trabalhador não-filiado pede o código: nome + CPF + e-mail. */
export async function enviarCodigoTrabalhador(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(texto(fd, "cpf"))
  const nome = texto(fd, "nome")
  const email = texto(fd, "email").toLowerCase()
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  if (!nome) return { erro: "Informe seu nome completo." }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "Informe um e-mail válido." }
  }
  const filiado = await buscarFiliadoPorCpf(cpf)
  if (filiado?.ativo) {
    return {
      erro: "Este CPF é de um filiado — use o acesso do filiado (por CPF).",
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { tipo: "nao_filiado", cpf, nome } },
  })
  if (error) return { erro: "Não foi possível enviar o código. Tente de novo." }
  return { ok: `Código enviado para ${mascararEmail(email)}.` }
}

export async function confirmarCodigoTrabalhador(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(texto(fd, "cpf"))
  const nome = texto(fd, "nome")
  const email = texto(fd, "email").toLowerCase()
  const token = texto(fd, "token")
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }

  const supabase = await createClient()
  const { data: verificado, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  })
  if (error || !verificado.user) return { erro: "Código inválido ou expirado." }

  // Garante o CPF/nome na conta e o cadastro do trabalhador (a sessão só
  // resolve com metadata.cpf + registro em portal_nao_filiado).
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  await admin.auth.admin.updateUserById(verificado.user.id, {
    user_metadata: { cpf, tipo: "nao_filiado", nome },
  })
  const { data: existente } = await admin
    .from("portal_nao_filiado")
    .select("id")
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (existente) {
    await admin
      .from("portal_nao_filiado")
      .update({ nome, email })
      .eq("id", existente.id)
  } else {
    await admin.from("portal_nao_filiado").insert({
      cpf,
      nome,
      email,
      emp_proprietaria_id: empId,
    })
  }
  redirect("/portal/oposicao")
}

// ── Fluxo da oposição ────────────────────────────────────────────────────────

async function campanhaNoPrazo(
  campanhaId: string
): Promise<
  | { erro: string }
  | { campanha: NonNullable<Awaited<ReturnType<typeof obterCampanhaPublica>>> }
> {
  const campanha = await obterCampanhaPublica(campanhaId)
  if (!campanha || campanha.situacao !== "aberta") {
    return { erro: "Campanha indisponível." }
  }
  if (estadoPrazo(campanha.prazo_inicio, campanha.prazo_fim, hojeSP()) !== "aberto") {
    return { erro: "Fora do prazo desta campanha." }
  }
  return { campanha }
}

export async function confirmarOposicao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoTrabalhador()
  const campanhaId = texto(fd, "campanha_id")

  const r = await campanhaNoPrazo(campanhaId)
  if ("erro" in r) return { erro: r.erro }
  const campanha = r.campanha

  if (texto(fd, "declaracao") !== "on") {
    return { erro: "É preciso aceitar a declaração para prosseguir." }
  }
  const empregadorId = texto(fd, "empregador_id") || null
  if (campanha.fontes.length && !empregadorId) {
    return { erro: "Selecione sua fonte pagadora." }
  }

  const respostas = campanha.perguntas.map((p) => ({
    perguntaId: p.id,
    resposta: texto(fd, `pergunta_${p.id}`),
  }))
  const exigeDoc = exigeDocumento(
    campanha.modo_formalizacao,
    sessao.perfil === "filiado"
  )
  const { ip, ua } = await rastro()

  const { id, erro } = await registrarOposicao(
    {
      campanhaId,
      cpf: sessao.cpf,
      nome: sessao.nome,
      email: sessao.email,
      perfil: sessao.perfil,
      filiacaoId: sessao.perfil === "filiado" ? sessao.refId : null,
      empregadorId,
      matricula: texto(fd, "matricula") || null,
      respostas,
      ip,
      userAgent: ua,
    },
    exigeDoc
  )
  if (erro || !id) return { erro: erro ?? "Falha ao registrar." }
  redirect(`/portal/oposicao/comprovante/${id}`)
}

export async function desistir(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoTrabalhador()
  const campanhaId = texto(fd, "campanha_id")
  const { ip, ua } = await rastro()
  await registrarDesistencia(
    campanhaId,
    {
      cpf: sessao.cpf,
      nome: sessao.nome,
      email: sessao.email,
      perfil: sessao.perfil,
      filiacaoId: sessao.perfil === "filiado" ? sessao.refId : null,
    },
    ip,
    ua
  )
  redirect("/portal/oposicao?desistiu=1")
}

export async function enviarDocumento(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoTrabalhador()
  const opositorId = texto(fd, "opositor_id")
  const arquivo = fd.get("documento")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Anexe o PDF assinado." }
  }
  const oposicao = await minhaOposicao(texto(fd, "campanha_id"), sessao.cpf)
  if (!oposicao || oposicao.id !== opositorId) {
    return { erro: "Oposição não encontrada." }
  }
  const { ip, ua } = await rastro()
  const { erro } = await subirDocumentoAssinado(
    opositorId,
    sessao.cpf,
    arquivo,
    ip,
    ua
  )
  if (erro) return { erro }
  redirect(`/portal/oposicao/comprovante/${opositorId}`)
}
