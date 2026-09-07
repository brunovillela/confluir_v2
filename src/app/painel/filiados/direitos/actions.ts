"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  concederSuspensao,
  revogarSuspensao,
  salvarCarencia,
  salvarRegraInadimplencia,
} from "@/lib/db/filiacao-direitos"
import { invalidarCacheInadimplencia } from "@/lib/db/filiacao-inadimplencia"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  BENEFICIOS,
  type Beneficio,
  type EscopoSuspensao,
} from "@/lib/filiacao-direitos-constantes"

const BASE = "/painel/filiados/direitos"

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function marcado(fd: FormData, campo: string): boolean {
  return fd.get(campo) === "on"
}

export async function salvarCarenciaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const beneficio = txt(fd, "beneficio") as Beneficio
  if (!BENEFICIOS.some((b) => b.chave === beneficio)) {
    return { erro: "Benefício inválido." }
  }

  const dias = Number(txt(fd, "dias"))
  if (!Number.isFinite(dias) || dias < 0 || dias > 3650) {
    return { erro: "A carência deve ficar entre 0 e 3650 dias." }
  }
  const ativo = marcado(fd, "ativo")
  if (ativo && dias === 0) {
    return {
      erro: "Carência ligada com zero dia não trava nada. Informe os dias ou desligue.",
    }
  }

  const { erro } = await salvarCarencia(
    beneficio,
    { dias, ativo, observacao: txt(fd, "observacao") || null },
    sessao.usuario.id
  )
  if (erro) return { erro: `Não foi possível salvar: ${erro}` }

  revalidatePath(BASE)
  return { ok: "Carência salva." }
}

export async function salvarRegraAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const tipo = txt(fd, "tipo")
  if (!tipo) return { erro: "Tipo de remessa inválido." }

  const quantidade = Number(txt(fd, "quantidade"))
  const janela = Number(txt(fd, "janela_remessas"))
  if (!Number.isFinite(quantidade) || quantidade < 1) {
    return { erro: "A quantidade de faltas deve ser pelo menos 1." }
  }
  if (!Number.isFinite(janela) || janela < 1 || janela > 120) {
    return { erro: "A janela deve ficar entre 1 e 120 remessas." }
  }
  if (quantidade > janela) {
    return {
      erro: `Com janela de ${janela} remessa(s), ninguém chega a ${quantidade} faltas — a regra nunca se aplicaria.`,
    }
  }

  const { erro } = await salvarRegraInadimplencia(
    tipo,
    {
      quantidade,
      exigirConsecutivas: marcado(fd, "exigir_consecutivas"),
      janelaRemessas: janela,
      ativo: marcado(fd, "ativo"),
    },
    sessao.usuario.id
  )
  if (erro) return { erro: `Não foi possível salvar: ${erro}` }

  invalidarCacheInadimplencia()
  revalidatePath(BASE)
  revalidatePath("/painel/filiados/inadimplentes")
  return { ok: "Regra salva." }
}

export async function concederSuspensaoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")

  const cpf = limparCpf(txt(fd, "cpf"))
  if (!validarCpf(cpf)) return { erro: "Informe um CPF válido." }

  const escopo = txt(fd, "escopo") as EscopoSuspensao
  if (escopo !== "carencia" && escopo !== "inadimplencia") {
    return { erro: "Escopo inválido." }
  }

  // A justificativa é obrigatória: suspender uma regra do estatuto sem dizer
  // por quê é o tipo de coisa que ninguém consegue explicar dois anos depois.
  const motivo = txt(fd, "motivo")
  if (motivo.length < 10) {
    return { erro: "Escreva a justificativa — ela fica no registro, com seu nome." }
  }

  const { erro } = await concederSuspensao({
    cpf,
    escopo,
    alvo: txt(fd, "alvo") || null,
    motivo,
    vigenciaAte: txt(fd, "vigencia_ate") || null,
    usuarioId: sessao.usuario.id,
  })
  if (erro) return { erro: `Não foi possível conceder: ${erro}` }

  invalidarCacheInadimplencia()
  revalidatePath(BASE)
  revalidatePath("/painel/filiados/inadimplentes")
  return { ok: "Efeito suspensivo concedido." }
}

export async function revogarSuspensaoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const id = txt(fd, "id")
  if (!id) return { erro: "Registro inválido." }

  const { erro } = await revogarSuspensao(id, sessao.usuario.id)
  if (erro) return { erro: `Não foi possível revogar: ${erro}` }

  invalidarCacheInadimplencia()
  revalidatePath(BASE)
  revalidatePath("/painel/filiados/inadimplentes")
  return { ok: "Efeito suspensivo revogado." }
}
