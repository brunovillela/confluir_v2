"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import {
  atualizarEspaco,
  criarBloqueio,
  criarEspaco,
  criarJanelas,
  encerrarBloqueio,
  excluirBloqueio,
  excluirJanela,
  type DadosEspaco,
} from "@/lib/db/espacos"
import {
  modoValido,
  motivoValido,
  publicoValido,
  visitaValida,
} from "@/lib/espacos-constantes"

type Estado = { erro?: string; ok?: string }

const AQUI = "/painel/espacos"

const marcado = (fd: FormData, nome: string) => fd.get(nome) === "on"
const txt = (fd: FormData, nome: string) => String(fd.get(nome) ?? "").trim()

function lerEspaco(fd: FormData): DadosEspaco | string {
  const nome = txt(fd, "nome")
  if (!nome) return "Informe o nome do espaço."
  const visita = txt(fd, "visita")
  if (!visitaValida(visita)) return "Escolha a modalidade da visita técnica."
  const publico = txt(fd, "publico")
  if (!publicoValido(publico)) return "Escolha quem pode solicitar."

  const capacidadeBruta = txt(fd, "capacidade")
  const capacidade = capacidadeBruta ? Number(capacidadeBruta) : null
  if (capacidade !== null && (!Number.isFinite(capacidade) || capacidade <= 0)) {
    return "A lotação tem de ser um número maior que zero."
  }

  const recintoIds = txt(fd, "recintos")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const principal = txt(fd, "recinto_principal")

  return {
    nome,
    descricao: txt(fd, "descricao") || null,
    sedeId: txt(fd, "sede_id") || null,
    capacidade,
    visita,
    exigeTermo: marcado(fd, "exige_termo"),
    exigeAutorizacao: marcado(fd, "exige_autorizacao"),
    publico,
    agendaPublica: marcado(fd, "agenda_publica"),
    responsavelVisitaId: txt(fd, "responsavel") || null,
    ativo: marcado(fd, "ativo"),
    recintoIds,
    recintoPrincipalId:
      principal && recintoIds.includes(principal)
        ? principal
        : (recintoIds[0] ?? null),
  }
}

export async function criarEspacoAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const dados = lerEspaco(fd)
  if (typeof dados === "string") return { erro: dados }

  const { id, erro } = await criarEspaco(dados, sessao.usuario.id as string)
  if (erro && !id) return { erro }
  revalidatePath(AQUI)
  redirect(`${AQUI}/${id}${erro ? "?aviso=ambientes" : "?criado=1"}`)
}

export async function atualizarEspacoAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  if (!id) return { erro: "Espaço não identificado." }
  const dados = lerEspaco(fd)
  if (typeof dados === "string") return { erro: dados }

  const { erro } = await atualizarEspaco(id, dados)
  if (erro) return { erro }
  revalidatePath(AQUI)
  revalidatePath(`${AQUI}/${id}`)
  redirect(`${AQUI}/${id}?salvo=1`)
}

// ── Janelas ──────────────────────────────────────────────────────────────────

export async function criarJanelasAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  await requirePermissao("espacos_gestao")
  const espacoId = txt(fd, "espaco_id")
  if (!espacoId) return { erro: "Espaço não identificado." }
  const modo = txt(fd, "modo")
  if (!modoValido(modo)) return { erro: "Escolha a forma de cessão." }

  const dias = fd
    .getAll("dias")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  const slotBruto = txt(fd, "slot_minutos")

  const { erro, criadas } = await criarJanelas(espacoId, {
    dias,
    horaInicio: txt(fd, "hora_inicio"),
    horaTermino: txt(fd, "hora_termino"),
    modo,
    slotMinutos: slotBruto ? Number(slotBruto) : null,
    rotulo: txt(fd, "rotulo") || null,
  })
  if (erro) return { erro }
  revalidatePath(`${AQUI}/${espacoId}`)
  return { ok: `${criadas} faixa${criadas === 1 ? "" : "s"} de horário adicionada${criadas === 1 ? "" : "s"}.` }
}

export async function excluirJanelaAction(fd: FormData): Promise<void> {
  await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const espacoId = txt(fd, "espaco_id")
  if (id) await excluirJanela(id)
  revalidatePath(`${AQUI}/${espacoId}`)
}

// ── Bloqueios ────────────────────────────────────────────────────────────────

export async function criarBloqueioAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const espacoId = txt(fd, "espaco_id")
  if (!espacoId) return { erro: "Espaço não identificado." }
  const motivo = txt(fd, "motivo")
  if (!motivoValido(motivo)) return { erro: "Escolha o motivo do bloqueio." }

  const { erro } = await criarBloqueio(
    espacoId,
    {
      inicio: txt(fd, "inicio"),
      termino: txt(fd, "termino") || null,
      motivo,
      descricao: txt(fd, "descricao") || null,
    },
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  revalidatePath(`${AQUI}/${espacoId}`)
  revalidatePath(AQUI)
  return { ok: "Bloqueio registrado." }
}

export async function encerrarBloqueioAction(fd: FormData): Promise<void> {
  const sessao = await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const espacoId = txt(fd, "espaco_id")
  if (id) await encerrarBloqueio(id, sessao.usuario.id as string)
  revalidatePath(`${AQUI}/${espacoId}`)
  revalidatePath(AQUI)
}

export async function excluirBloqueioAction(fd: FormData): Promise<void> {
  await requirePermissao("espacos_gestao")
  const id = txt(fd, "id")
  const espacoId = txt(fd, "espaco_id")
  if (id) await excluirBloqueio(id)
  revalidatePath(`${AQUI}/${espacoId}`)
  revalidatePath(AQUI)
}
