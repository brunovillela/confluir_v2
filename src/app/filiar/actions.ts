"use server"

import { headers } from "next/headers"

import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  iniciarComEmail,
  iniciarPeloCpf,
  reenviarLinkDaFicha,
  type InicioPeloCpf,
} from "@/lib/db/filiacao-ficha-online"
import { dataValida, emailValido } from "@/lib/ficha-filiacao"
import { exigirHumano } from "@/lib/turnstile"

/** O que a tela de começo recebe de volta. */
export type EstadoInicio = {
  erro?: string
  campo?: string
  resultado?: InicioPeloCpf
  ok?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** IP e user-agent para a trilha de auditoria. */
async function rastro(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
  return { ip, ua: h.get("user-agent") }
}

function lerCpfENascimento(fd: FormData): { cpf: string; nascimento: string } | EstadoInicio {
  const cpf = limparCpf(String(fd.get("cpf") ?? ""))
  if (!validarCpf(cpf)) return { erro: "Confira o CPF: os números não formam um CPF válido.", campo: "cpf" }
  const nascimento = String(fd.get("nascimento") ?? "")
  if (!dataValida(nascimento)) return { erro: "Informe a sua data de nascimento.", campo: "nascimento" }
  return { cpf, nascimento }
}

/** Passo 1: CPF + nascimento. */
export async function comecarPeloCpfAction(_prev: EstadoInicio, fd: FormData): Promise<EstadoInicio> {
  const humano = await exigirHumano(fd)
  if (humano) return { erro: humano }
  const lido = lerCpfENascimento(fd)
  if (!("cpf" in lido)) return lido
  const r = await iniciarPeloCpf({ ...lido, ...(await rastro()) })
  return r.tipo === "erro" ? { erro: r.erro } : { resultado: r }
}

/** Passo 1 com e-mail: sem cadastro, ou "não tenho mais acesso ao e-mail". */
export async function comecarComEmailAction(_prev: EstadoInicio, fd: FormData): Promise<EstadoInicio> {
  const humano = await exigirHumano(fd)
  if (humano) return { erro: humano }
  const lido = lerCpfENascimento(fd)
  if (!("cpf" in lido)) return lido
  const email = String(fd.get("email") ?? "").trim().toLowerCase()
  if (!emailValido(email)) return { erro: "Confira o e-mail: falta o @ ou o final (como .com).", campo: "email" }
  if (String(fd.get("email_confirmacao") ?? "").trim().toLowerCase() !== email) {
    return { erro: "Os dois e-mails não são iguais. Digite o mesmo e-mail nos dois campos.", campo: "email_confirmacao" }
  }
  const r = await iniciarComEmail({ ...lido, email, ...(await rastro()) })
  return r.tipo === "erro" ? { erro: r.erro } : { resultado: r }
}

/** "Não recebi o e-mail": manda de novo para o mesmo endereço. */
export async function reenviarLinkAction(_prev: EstadoInicio, fd: FormData): Promise<EstadoInicio> {
  const id = String(fd.get("ficha") ?? "")
  if (!UUID.test(id)) return { erro: "Comece de novo pelo CPF." }
  const { ip, ua } = await rastro()
  const r = await reenviarLinkDaFicha(id, ip, ua)
  return r.erro ? { erro: r.erro } : { ok: "Enviamos de novo. Pode levar alguns minutos para chegar." }
}
