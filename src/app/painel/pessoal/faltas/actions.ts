"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  decidirFalta,
  excluirFalta,
  lerConfigFaltas,
  registrarFalta,
  salvarConfigFaltas,
  subirComprovacaoFalta,
} from "@/lib/db/faltas"

/** Gestão das faltas: o Pessoal inteiro ou a permissão própria da área. */
async function exigirGestao() {
  return requirePermissao("pessoal_gestao", ["pessoal_faltas_justificadas"])
}

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function revalidar() {
  revalidatePath("/painel/pessoal/faltas")
  revalidatePath("/painel/perfil/faltas")
  revalidatePath("/painel/pessoal/atestados")
  revalidatePath("/painel/pessoal")
  revalidatePath("/painel")
}

/** Registro pela gestão: já autorizada, e pode passar do limite (confirmado). */
export async function registrarFaltaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigirGestao()
  const funcionarioId = texto(fd, "funcionario_id")
  const data = texto(fd, "data")
  if (!funcionarioId) return { erro: "Escolha o funcionário." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data da falta." }

  const up = await subirComprovacaoFalta(fd.get("comprovacao"), funcionarioId)
  if ("erro" in up) return up
  const { erro } = await registrarFalta(
    {
      funcionarioId,
      data,
      tipo: texto(fd, "tipo"),
      observacao: texto(fd, "observacao") || null,
      comprovacao: up.caminho,
    },
    {
      solicitanteId: sessao.usuario.id,
      autorizarJa: true,
      ignorarLimite: fd.get("ignorar_limite") === "on",
    }
  )
  if (erro) return { erro }
  revalidar()
  return { ok: "Falta registrada e autorizada." }
}

export async function decidirFaltaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigirGestao()
  const id = texto(fd, "id")
  if (!id) return { erro: "Falta inválida." }
  const autorizar = texto(fd, "decisao") === "autorizar"
  const { erro } = await decidirFalta(id, sessao.usuario.id, autorizar, texto(fd, "motivo") || null)
  if (erro) return { erro }
  revalidar()
  return { ok: autorizar ? "Falta autorizada." : "Falta recusada." }
}

export async function excluirFaltaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirGestao()
  const id = texto(fd, "id")
  if (!id) return { erro: "Falta inválida." }
  const { erro } = await excluirFalta(id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Falta excluída." }
}

/** Limite vazio = sem limite; zero é aceito (bloqueia a solicitação). */
function lerLimite(fd: FormData, campo: string): number | null | "invalido" {
  const v = texto(fd, campo)
  if (!v) return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 366 ? n : "invalido"
}

export async function salvarConfigFaltasAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigirGestao()
  const ano = lerLimite(fd, "limite_ano")
  const mes = lerLimite(fd, "limite_mes")
  const semana = lerLimite(fd, "limite_semana")
  if (ano === "invalido" || mes === "invalido" || semana === "invalido") {
    return { erro: "Os limites devem ser números inteiros (ou vazios, para sem limite)." }
  }
  const tipos = [
    ...new Set(
      texto(fd, "tipos")
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean)
    ),
  ]
  if (tipos.length === 0) return { erro: "Informe ao menos um tipo de justificativa." }
  const { config: atual } = await lerConfigFaltas()
  const { erro } = await salvarConfigFaltas(
    {
      ...atual,
      limiteAno: ano,
      limiteMes: mes,
      limiteSemana: semana,
      tipos,
      exigeComprovacao: fd.get("exige_comprovacao") === "on",
      travaSemComprovacao: fd.get("trava_sem_comprovacao") === "on",
    },
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidar()
  redirect("/painel/pessoal/faltas/configuracoes?salvo=1")
}
