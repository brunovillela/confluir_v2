"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  atualizarMesario,
  atualizarUrna,
  criarMesario,
  criarUrna,
  registrarLacre,
  removerLacre,
  removerMesario,
  removerUrna,
} from "@/lib/db/votacao-mesarios"

function rev(assembleiaId: string) {
  revalidatePath(`/painel/representacao/assembleias/urnas/${assembleiaId}`)
}

function dataHora(formData: FormData, campo: string): string | null {
  const v = String(formData.get(campo) ?? "").trim()
  // <input type="datetime-local"> → "YYYY-MM-DDTHH:mm" (hora local).
  return v ? new Date(v).toISOString() : null
}

function tipoUrna(formData: FormData): "fisica" | "digital" {
  return String(formData.get("tipo") ?? "") === "fisica" ? "fisica" : "digital"
}

// ── Urnas ───────────────────────────────────────────────────────────────────

export async function criarUrnaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const nome = String(formData.get("nome") ?? "").trim()
  if (!assembleiaId || !nome) return { erro: "Informe o nome da urna." }
  const r = await criarUrna(assembleiaId, {
    nome,
    tipo: tipoUrna(formData),
    abertura: dataHora(formData, "abertura"),
    fechamento: dataHora(formData, "fechamento"),
  })
  if (r.erro) return { erro: r.erro }
  rev(assembleiaId)
  return { ok: "Urna criada." }
}

export async function salvarUrnaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const urnaId = String(formData.get("urna_id") ?? "")
  const nome = String(formData.get("nome") ?? "").trim()
  if (!urnaId || !nome) return { erro: "Informe o nome da urna." }
  const r = await atualizarUrna(urnaId, {
    nome,
    tipo: tipoUrna(formData),
    abertura: dataHora(formData, "abertura"),
    fechamento: dataHora(formData, "fechamento"),
    ativa: String(formData.get("ativa") ?? "") === "on",
  })
  if (r.erro) return { erro: r.erro }
  rev(assembleiaId)
  return { ok: "Urna salva." }
}

export async function removerUrnaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const urnaId = String(formData.get("urna_id") ?? "")
  if (!urnaId) return { erro: "Urna inválida." }
  const r = await removerUrna(urnaId)
  if (r.erro) return { erro: r.erro }
  rev(assembleiaId)
  return { ok: "Urna excluída." }
}

// ── Mesários ──────────────────────────────────────────────────────────────

function cpfOpcional(formData: FormData): {
  erro?: string
  cpf: string | null
} {
  const bruto = String(formData.get("cpf") ?? "").trim()
  if (!bruto) return { cpf: null }
  const cpf = limparCpf(bruto)
  if (!validarCpf(cpf)) return { erro: "CPF inválido.", cpf: null }
  return { cpf }
}

export async function criarMesarioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const rodadaId = String(formData.get("rodada_id") ?? "")
  const nome = String(formData.get("nome") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  if (!rodadaId) return { erro: "Rodada não identificada." }
  if (!nome) return { erro: "Informe o nome completo." }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "Informe um e-mail válido." }
  }
  const { erro, cpf } = cpfOpcional(formData)
  if (erro) return { erro }
  const r = await criarMesario(rodadaId, { nome, cpf, email })
  if (r.erro) return { erro: r.erro }
  rev(assembleiaId)
  return { ok: "Mesário cadastrado." }
}

export async function salvarMesarioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const mesarioId = String(formData.get("mesario_id") ?? "")
  const nome = String(formData.get("nome") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  if (!mesarioId || !nome) return { erro: "Informe o nome completo." }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "Informe um e-mail válido." }
  }
  const { erro, cpf } = cpfOpcional(formData)
  if (erro) return { erro }
  const r = await atualizarMesario(mesarioId, {
    nome,
    cpf,
    email,
    ativo: String(formData.get("ativo") ?? "") === "on",
  })
  if (r.erro) return { erro: r.erro }
  rev(assembleiaId)
  return { ok: "Mesário salvo." }
}

export async function removerMesarioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const mesarioId = String(formData.get("mesario_id") ?? "")
  if (!mesarioId) return { erro: "Mesário inválido." }
  const r = await removerMesario(mesarioId)
  if (r.erro) return { erro: r.erro }
  rev(assembleiaId)
  return { ok: "Mesário excluído." }
}

// ── Lacres ──────────────────────────────────────────────────────────────────

export async function registrarLacreAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const urnaId = String(formData.get("urna_id") ?? "")
  const numero = String(formData.get("numero") ?? "").trim()
  const tipo = String(formData.get("tipo") ?? "") === "principal" ? "principal" : "boca"
  const evento = String(formData.get("evento") ?? "") === "rompido" ? "rompido" : "instalado"
  if (!urnaId || !numero) return { erro: "Informe o número do lacre." }
  const r = await registrarLacre(urnaId, {
    tipo,
    numero,
    evento,
    data: dataHora(formData, "data"),
    guardadoNaUrna: String(formData.get("guardado_na_urna") ?? "") === "on",
    observacao: String(formData.get("observacao") ?? "").trim() || null,
  })
  if (r.erro) return { erro: r.erro }
  rev(assembleiaId)
  return { ok: "Lacre registrado." }
}

export async function removerLacreAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const lacreId = String(formData.get("lacre_id") ?? "")
  if (!lacreId) return { erro: "Lacre inválido." }
  const r = await removerLacre(lacreId)
  if (r.erro) return { erro: r.erro }
  rev(assembleiaId)
  return { ok: "Lacre removido." }
}
