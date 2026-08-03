"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  criarSolicitacao,
  obterTermosVigentes,
  regenerarCodigo,
  verificarCodigo,
  type DadosSolicitacao,
} from "@/lib/db/filiacao-publica"
import { enviarEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { capitalizarNome } from "@/lib/texto"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** IP e user-agent para a trilha de auditoria. */
async function rastro(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
  return { ip, ua: h.get("user-agent") }
}

/** Base URL do tenant (subdomínio da requisição), com fallback p/ SITE_URL. */
async function baseUrl(): Promise<string> {
  const h = await headers()
  const host = h.get("host")
  if (!host) return SITE_URL
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

function emailCodigo(codigo: string): { assunto: string; html: string } {
  return {
    assunto: "Seu código de verificação — filiação",
    html: `<p>Olá!</p><p>Seu código para confirmar o e-mail e continuar a filiação é:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${codigo}</p><p>Ele vale por 15 minutos. Se você não iniciou uma filiação, ignore este e-mail.</p><p>Confluir</p>`,
  }
}

/** Passo 1: recebe a ficha, cria a solicitação e envia o código por e-mail. */
export async function solicitarFiliacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const texto = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim()
    return v === "" ? null : v
  }
  const data = (campo: string) => {
    const v = String(formData.get(campo) ?? "")
    return DATA.test(v) ? v : null
  }

  const nomeBruto = texto("nome_completo")
  if (!nomeBruto) return { erro: "Informe o nome completo." }
  const nome = capitalizarNome(nomeBruto)

  const nomeSocialBruto = texto("nome_social")
  const nomeSocial = nomeSocialBruto ? capitalizarNome(nomeSocialBruto) : null

  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }

  const email = texto("email")
  if (!email || !EMAIL.test(email)) return { erro: "Informe um e-mail válido." }

  if (formData.get("aceite_lgpd") !== "on") {
    return { erro: "É preciso aceitar o tratamento de dados (LGPD) para se filiar." }
  }
  if (formData.get("aceite_desconto") !== "on") {
    return { erro: "É preciso autorizar o desconto da mensalidade para se filiar." }
  }

  const sexoBruto = String(formData.get("sexo") ?? "")
  const empregador = String(formData.get("empregador_id") ?? "")
  const { ip, ua } = await rastro()
  // Versão vigente dos termos aceitos (verdade no servidor, não do cliente).
  const termos = await obterTermosVigentes()

  const dados: DadosSolicitacao = {
    nome,
    nome_social: nomeSocial,
    cpf,
    nascimento: data("nascimento"),
    sexo: ["Masculino", "Feminino", "Outro"].includes(sexoBruto) ? sexoBruto : null,
    email,
    telefone_1: texto("telefone_1")?.replace(/\D/g, "") ?? null,
    telefone_1_whatsapp: formData.get("telefone_1_whatsapp") === "on",
    telefone_2: texto("telefone_2")?.replace(/\D/g, "") ?? null,
    endereco_cep: texto("endereco_cep"),
    endereco_logradouro: texto("endereco_logradouro"),
    endereco_numero: texto("endereco_numero"),
    endereco_complemento: texto("endereco_complemento"),
    endereco_bairro: texto("endereco_bairro"),
    endereco_cidade: texto("endereco_cidade"),
    endereco_estado: texto("endereco_estado"),
    empregador_id: UUID.test(empregador) ? empregador : null,
    matricula: texto("matricula"),
    cargo: texto("cargo"),
    lotacao: texto("lotacao"),
    aceite_lgpd: true,
    aceite_desconto: true,
    tl_lgpd_id: termos.lgpd?.id ?? null,
    tl_desconto_id: termos.desconto?.id ?? null,
    ip,
    userAgent: ua,
  }

  const res = await criarSolicitacao(dados)
  if (res.erro || !res.codigo || !res.token) return { erro: res.erro ?? "Falha ao enviar a ficha." }

  const { assunto, html } = emailCodigo(res.codigo)
  const enviado = await enviarEmail({ email, nome, assunto, html })
  if (!enviado) {
    // Sem BREVO configurado: registra no log do servidor p/ teste local.
    console.info(`[filiar] código de ${email}: ${res.codigo} (token ${res.token})`)
  }

  redirect(`/filiar/verificar?s=${res.token}`)
}

/** Reenvia o código. */
export async function reenviarCodigoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const token = String(formData.get("token") ?? "")
  if (!UUID.test(token)) return { erro: "Solicitação inválida." }

  const res = await regenerarCodigo(token)
  if (res.erro || !res.codigo || !res.email) return { erro: res.erro ?? "Falha ao reenviar." }

  const { assunto, html } = emailCodigo(res.codigo)
  const enviado = await enviarEmail({ email: res.email, nome: res.nome, assunto, html })
  if (!enviado) {
    console.info(`[filiar] código reenviado de ${res.email}: ${res.codigo} (token ${token})`)
  }
  return { ok: "Enviamos um novo código para o seu e-mail." }
}

/** Passo 2: confere o código; no acerto envia o link único e leva à ficha. */
export async function verificarCodigoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const token = String(formData.get("token") ?? "")
  if (!UUID.test(token)) return { erro: "Solicitação inválida." }
  const codigo = String(formData.get("codigo") ?? "").trim()
  if (!codigo) return { erro: "Informe o código recebido por e-mail." }

  const { ip, ua } = await rastro()
  const res = await verificarCodigo(token, codigo, ip, ua)
  if (res.erro || !res.ok) return { erro: res.erro ?? "Falha ao verificar." }

  // E-mail de boas-vindas com o link único da ficha.
  if (res.email) {
    const link = `${await baseUrl()}/ficha/${token}`
    const html = `<p>Olá${res.nome ? `, ${res.nome.split(" ")[0]}` : ""}!</p><p>Seu e-mail foi confirmado. Acesse sua ficha de filiação pelo link abaixo — lá você baixa a ficha para assinar no gov.br e envia o documento assinado:</p><p><a href="${link}">${link}</a></p><p>Guarde este link: é o seu acesso para acompanhar a filiação.</p><p>Confluir</p>`
    const enviado = await enviarEmail({
      email: res.email,
      nome: res.nome,
      assunto: "Sua ficha de filiação — próximos passos",
      html,
    })
    if (!enviado) console.info(`[filiar] link único: ${link}`)
  }

  redirect(`/ficha/${token}?boasvindas=1`)
}
