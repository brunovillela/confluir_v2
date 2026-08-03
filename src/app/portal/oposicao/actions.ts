"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { tenantAtual } from "@/lib/tenant"

import { requireSessaoTrabalhador } from "@/lib/auth"
import { buscarFiliadoPorCpf, type EstadoForm } from "@/lib/contas"
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

// ── Autocadastro / login do não-filiado ──────────────────────────────────────

export async function cadastrarNaoFiliado(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(texto(fd, "cpf"))
  const nome = texto(fd, "nome")
  const email = texto(fd, "email").toLowerCase()
  const senha = texto(fd, "senha")
  const nascimento = texto(fd, "nascimento") || null

  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  if (!nome) return { erro: "Informe seu nome completo." }
  if (!email.includes("@")) return { erro: "Informe um e-mail válido." }
  if (senha.length < 6) return { erro: "A senha deve ter ao menos 6 caracteres." }

  const empId = await tenantAtual()
  const admin = await createAdminClient()

  const filiado = await buscarFiliadoPorCpf(cpf)
  if (filiado?.ativo) {
    return {
      erro: "Este CPF é de um filiado. Entre pelo acesso do filiado (CPF + senha do portal).",
    }
  }

  const { data: existente } = await admin
    .from("portal_nao_filiado")
    .select("id")
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (existente) {
    return { erro: "Este CPF já tem cadastro. Use o acesso abaixo para entrar." }
  }

  const { data: criado, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { cpf, tipo: "nao_filiado", nome },
  })
  if (error || !criado.user) {
    return {
      erro: "Não foi possível criar o acesso. O e-mail pode já estar em uso.",
    }
  }

  await admin.from("portal_nao_filiado").insert({
    cpf,
    nome,
    email,
    telefone: texto(fd, "telefone") || null,
    nascimento,
    emp_proprietaria_id: empId,
  })

  const supabase = await createClient()
  const { error: erroLogin } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  })
  if (erroLogin) {
    return { ok: "Cadastro criado. Faça login abaixo para continuar." }
  }
  redirect("/portal/oposicao")
}

export async function loginNaoFiliado(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(texto(fd, "cpf"))
  const senha = texto(fd, "senha")
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  if (!senha) return { erro: "Informe sua senha." }

  const admin = await createAdminClient()
  const { data: perfil } = await admin
    .from("portal_nao_filiado")
    .select("email")
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!perfil?.email) return { erro: "CPF ou senha incorretos." }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(perfil.email),
    password: senha,
  })
  if (error) return { erro: "CPF ou senha incorretos." }
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
