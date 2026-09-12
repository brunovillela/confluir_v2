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
import {
  incluirBeneficiarioHospedagem,
  listarBeneficiariosHospedagem,
  removerBeneficiarioHospedagem,
  salvarCondicoesHospedagem,
} from "@/lib/db/hospedagem-condicoes"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { REGIMES_TRABALHO } from "@/lib/filiacao"
import {
  BENEFICIOS,
  type Beneficio,
  type EscopoSuspensao,
} from "@/lib/filiacao-direitos-constantes"

const BASE = "/painel/filiados/direitos"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

// ── Condições da hospedagem ─────────────────────────────────────────────────

export async function salvarCondicoesHospedagemAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")

  const restringirFontes = marcado(fd, "restringir_fontes")
  const fontesIds = [
    ...new Set(fd.getAll("fontes").map(String).filter((v) => UUID.test(v))),
  ]
  const restringirRegimes = marcado(fd, "restringir_regimes")
  const regimes = [...new Set(fd.getAll("regimes").map(String))].filter((r) =>
    (REGIMES_TRABALHO as readonly string[]).includes(r)
  )
  const limitarQuantidade = marcado(fd, "limitar_quantidade")
  const quantidade = Number(txt(fd, "quantidade_maxima") || "1")
  const quantidadeValida =
    Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= 365
  const somenteBeneficiarios = marcado(fd, "somente_beneficiarios")

  if (restringirFontes && fontesIds.length === 0) {
    return {
      erro: "Marque ao menos uma fonte pagadora ou desligue a restrição por fonte.",
    }
  }
  if (restringirRegimes && regimes.length === 0) {
    return {
      erro: "Marque ao menos um regime de trabalho ou desligue a restrição por regime.",
    }
  }
  if (limitarQuantidade && !quantidadeValida) {
    return { erro: "A quantidade de cupons deve ser um número inteiro entre 1 e 365." }
  }
  if (somenteBeneficiarios) {
    // Restringir a uma lista vazia tiraria a hospedagem de todo mundo.
    const lista = await listarBeneficiariosHospedagem()
    if (lista.length === 0) {
      return {
        erro: "A lista de beneficiários está vazia. Inclua as pessoas antes de restringir a hospedagem a ela.",
      }
    }
  }

  const { erro } = await salvarCondicoesHospedagem(
    {
      restringirFontes,
      fontesIds,
      restringirRegimes,
      regimes,
      limitarQuantidade,
      quantidadeMaxima: quantidadeValida ? quantidade : 1,
      quantidadePeriodo: txt(fd, "quantidade_periodo") === "ano" ? "ano" : "mes",
      somenteBeneficiarios,
      observacao: txt(fd, "observacao") || null,
    },
    sessao.usuario.id
  )
  if (erro) return { erro: `Não foi possível salvar: ${erro}` }

  revalidatePath(BASE)
  revalidatePath("/portal/hospedagem")
  return { ok: "Condições da hospedagem salvas." }
}

export async function incluirBeneficiarioHospedagemAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")

  const cpf = limparCpf(txt(fd, "cpf"))
  if (!validarCpf(cpf)) return { erro: "Informe um CPF válido." }

  const { erro, nome } = await incluirBeneficiarioHospedagem({
    cpf,
    observacao: txt(fd, "observacao") || null,
    usuarioId: sessao.usuario.id,
  })
  if (erro) return { erro }

  revalidatePath(BASE)
  revalidatePath("/portal/hospedagem")
  return { ok: `${nome ?? "Pessoa"} incluída na lista de beneficiários.` }
}

export async function removerBeneficiarioHospedagemAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")
  const id = txt(fd, "id")
  if (!UUID.test(id)) return { erro: "Registro inválido." }

  const { erro } = await removerBeneficiarioHospedagem(id)
  if (erro) return { erro: `Não foi possível remover: ${erro}` }

  revalidatePath(BASE)
  revalidatePath("/portal/hospedagem")
  return { ok: "Removida da lista." }
}
