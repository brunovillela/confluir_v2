"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { listarDepartamentosCompletos } from "@/lib/db/departamentos"
import { bloquearEndereco, liberarEndereco, obterControlesEmail, salvarControlesEmail } from "@/lib/db/email-controles"
import { MODULOS_EMAIL, tituloModuloEmail, type ControlesEmail } from "@/lib/email-processos"

const ROTA = "/painel/gestao/email"

function inteiroOuNulo(fd: FormData, nome: string): number | null | "invalido" {
  const bruto = String(fd.get(nome) ?? "").trim().replace(/[.\s]/g, "")
  if (!bruto) return null
  const n = Number(bruto)
  return Number.isInteger(n) && n > 0 ? n : "invalido"
}

/**
 * Controles do e-mail: módulos ligados (`mod:<slug>` marcado = ligado), teto
 * mensal, parar no teto e cotas por departamento (`cota:<id>`).
 */
export async function salvarControlesEmailAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const { controles: antes } = await obterControlesEmail()

  const modulosDesligados = MODULOS_EMAIL.filter((m) => fd.has(`presente:${m.slug}`) && !fd.has(`mod:${m.slug}`)).map((m) => m.slug)
  const limite = inteiroOuNulo(fd, "limite_mensal")
  if (limite === "invalido") return { erro: "Use um número inteiro maior que zero (ex.: 5000) ou deixe em branco.", campo: "limite_mensal" }

  const deptos = (await listarDepartamentosCompletos()).filter((d) => !d.legado)
  const nomes = new Map(deptos.map((d) => [d.id, d.nome]))
  const cotas: Record<string, number> = {}
  for (const [nome] of fd.entries()) {
    if (!nome.startsWith("cota:")) continue
    const id = nome.slice("cota:".length)
    if (!nomes.has(id)) continue
    const v = inteiroOuNulo(fd, nome)
    if (v === "invalido") return { erro: "Use um número inteiro maior que zero ou deixe em branco.", campo: nome }
    if (v !== null) cotas[id] = v
  }

  const novo: ControlesEmail = { modulosDesligados, limiteMensal: limite, bloquearNoLimite: fd.get("bloquear_no_limite") === "on", cotasDepartamento: cotas }
  const mudancas: string[] = []
  const desl = [...novo.modulosDesligados].sort().join(",")
  if ([...antes.modulosDesligados].sort().join(",") !== desl) {
    mudancas.push(`módulos desligados: ${novo.modulosDesligados.map(tituloModuloEmail).join(", ") || "nenhum"}`)
  }
  if (antes.limiteMensal !== novo.limiteMensal) mudancas.push(`teto: ${novo.limiteMensal ?? "sem teto"}`)
  if (antes.bloquearNoLimite !== novo.bloquearNoLimite) mudancas.push(novo.bloquearNoLimite ? "para no teto" : "só avisa no teto")
  const ids = new Set([...Object.keys(antes.cotasDepartamento), ...Object.keys(cotas)])
  for (const id of ids) {
    if ((antes.cotasDepartamento[id] ?? null) !== (cotas[id] ?? null)) mudancas.push(`cota ${nomes.get(id) ?? id}: ${cotas[id] ?? "sem cota"}`)
  }
  if (!mudancas.length) return { ok: "Nada mudou." }
  const r = await salvarControlesEmail(novo, mudancas, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Controles do e-mail salvos. Valem em até um minuto para todos os envios." }
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function bloquearEnderecoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const endereco = String(fd.get("endereco") ?? "").trim().toLowerCase()
  if (!EMAIL_OK.test(endereco) || endereco.length > 320) return { erro: "Informe um e-mail válido.", campo: "endereco" }
  const motivo = String(fd.get("motivo") ?? "").trim() || null
  const r = await bloquearEndereco(endereco, motivo, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: `${endereco} não recebe mais e-mails do sistema.` }
}

export async function liberarEnderecoAction(id: string): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const r = await liberarEndereco(id, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: `${r.endereco} liberado: volta a receber e-mails.` }
}
