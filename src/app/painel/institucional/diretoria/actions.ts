"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarAssento,
  adicionarIntegrante,
  adicionarLiberacao,
  adicionarLiberacoesEmLote,
  atualizarInstancia,
  atualizarIntegrante,
  atualizarMandato,
  criarGrupo,
  criarInstancia,
  criarMandato,
  removerAssento,
  removerGrupo,
  removerIntegrante,
  removerLiberacao,
  type DadosMandato,
  type MembroDoLote,
} from "@/lib/db/diretoria"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function inteiro(valor: string): number {
  const n = Number.parseInt(valor, 10)
  return Number.isFinite(n) ? n : 0
}

const CHAVE = "diretoria_mandatos"
const ALT = ["configuracoes"]

function lerMandato(formData: FormData): DadosMandato {
  return {
    mandato: texto(formData, "mandato"),
    data_inicio: dataISO(texto(formData, "data_inicio")),
    data_termino: dataISO(texto(formData, "data_termino")),
  }
}

export async function criarMandatoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const dados = lerMandato(formData)
  if (!dados.mandato) return { erro: "Informe o mandato (ex.: 2026–2029)." }

  const { id, erro } = await criarMandato(dados)
  if (erro) return { erro }
  revalidatePath("/painel/institucional/diretoria")
  redirect(`/painel/institucional/diretoria/${id}`)
}

export async function atualizarMandatoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "mandato_id")
  if (!id) return { erro: "Mandato inválido." }
  const dados = lerMandato(formData)
  if (!dados.mandato) return { erro: "Informe o mandato." }

  const { erro } = await atualizarMandato(id, dados)
  if (erro) return { erro }
  revalidatePath(`/painel/institucional/diretoria/${id}`, "layout")
  revalidatePath("/painel/institucional/diretoria")
  return { ok: "Mandato salvo." }
}

export async function adicionarIntegranteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const mandatoId = texto(formData, "mandato_id")
  const nome = texto(formData, "nome")
  const filiacaoId = texto(formData, "filiacao_id")
  if (!mandatoId) return { erro: "Mandato inválido." }
  if (!nome && !filiacaoId)
    return { erro: "Vincule um filiado ou informe o nome." }

  const { erro } = await adicionarIntegrante(mandatoId, {
    nome,
    cargo: texto(formData, "cargo") || null,
    ordem: inteiro(texto(formData, "ordem")),
    pode_assinar: texto(formData, "pode_assinar") === "1",
    grupo_id: texto(formData, "grupo_id") || null,
    filiacao_id: filiacaoId || null,
  })
  if (erro) return { erro }
  revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Integrante adicionado." }
}

// ── Grupos de membros ───────────────────────────────────────────────────────

export async function criarGrupoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const mandatoId = texto(formData, "mandato_id")
  const nome = texto(formData, "nome")
  if (!mandatoId) return { erro: "Mandato inválido." }
  if (!nome) return { erro: "Informe o nome do grupo." }
  const { erro } = await criarGrupo(mandatoId, nome, inteiro(texto(formData, "ordem")))
  if (erro) return { erro }
  revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Grupo criado." }
}

export async function removerGrupoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "grupo_id")
  const mandatoId = texto(formData, "mandato_id")
  if (!id) return { erro: "Grupo inválido." }
  const { erro } = await removerGrupo(id)
  if (erro) return { erro }
  if (mandatoId) revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Grupo removido." }
}

export async function atualizarIntegranteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "integrante_id")
  const mandatoId = texto(formData, "mandato_id")
  const nome = texto(formData, "nome")
  const filiacaoId = texto(formData, "filiacao_id")
  if (!id) return { erro: "Integrante inválido." }
  if (!nome && !filiacaoId)
    return { erro: "Vincule um filiado ou informe o nome." }

  const { erro } = await atualizarIntegrante(id, {
    nome,
    cargo: texto(formData, "cargo") || null,
    pode_assinar: texto(formData, "pode_assinar") === "1",
    grupo_id: texto(formData, "grupo_id") || null,
    filiacao_id: filiacaoId || null,
    ...(formData.has("situacao")
      ? {
          situacao: (["exercicio", "licenciado", "excluido"].includes(texto(formData, "situacao"))
            ? texto(formData, "situacao")
            : "exercicio") as "exercicio" | "licenciado" | "excluido",
          situacao_desde: /^\d{4}-\d{2}-\d{2}$/.test(texto(formData, "situacao_desde"))
            ? texto(formData, "situacao_desde")
            : null,
          situacao_motivo: texto(formData, "situacao_motivo") || null,
        }
      : {}),
  })
  if (erro) return { erro }
  if (mandatoId) revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Integrante salvo." }
}

export async function removerIntegranteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "integrante_id")
  const mandatoId = texto(formData, "mandato_id")
  if (!id) return { erro: "Integrante inválido." }

  const { erro } = await removerIntegrante(id)
  if (erro) return { erro }
  if (mandatoId) revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Integrante removido." }
}

// ── Liberações sindicais ────────────────────────────────────────────────────

export async function adicionarLiberacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const mandatoId = texto(formData, "mandato_id")
  const integrante_id = texto(formData, "integrante_id")
  if (!integrante_id) return { erro: "Selecione o diretor." }

  const documento = formData.get("documento")
  const { erro } = await adicionarLiberacao(
    {
      integrante_id,
      mandato_id: mandatoId || null,
      empresa_id: texto(formData, "empresa_id") || null,
      tipo: texto(formData, "tipo") === "pontual" ? "pontual" : "permanente",
      inicio: dataISO(texto(formData, "inicio")),
      fim: dataISO(texto(formData, "fim")),
      observacao: texto(formData, "observacao") || null,
    },
    documento instanceof File ? documento : undefined
  )
  if (erro) return { erro }
  if (mandatoId) revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Liberação registrada." }
}

/**
 * Várias liberações pelo mesmo ofício. Cada linha do formulário vem com a chave
 * em "membros" e os campos membro_<chave>_{integrante,filiacao,inicio,fim}.
 */
export async function adicionarLiberacoesLoteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const mandatoId = texto(formData, "mandato_id")
  if (!mandatoId) return { erro: "Mandato inválido." }
  const oficioId = texto(formData, "oficio_id")
  if (!oficioId) return { erro: "Escolha o ofício que oficializou as liberações." }

  const membros: MembroDoLote[] = texto(formData, "membros")
    .split(",")
    .filter(Boolean)
    .map((chave) => ({
      integranteId: texto(formData, `membro_${chave}_integrante`) || null,
      filiacaoId: texto(formData, `membro_${chave}_filiacao`) || null,
      inicio: dataISO(texto(formData, `membro_${chave}_inicio`)),
      fim: dataISO(texto(formData, `membro_${chave}_fim`)),
    }))

  const { erro, criadas } = await adicionarLiberacoesEmLote({
    mandatoId,
    empresaId: texto(formData, "empresa_id") || null,
    oficioId,
    observacao: texto(formData, "observacao") || null,
    membros,
  })
  if (erro) return { erro }
  revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  revalidatePath(`/painel/ferramentas/oficios/${oficioId}`)
  return { ok: `${criadas} liberaç${criadas === 1 ? "ão registrada" : "ões registradas"}.` }
}

export async function removerLiberacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "liberacao_id")
  const mandatoId = texto(formData, "mandato_id")
  if (!id) return { erro: "Liberação inválida." }
  const { erro } = await removerLiberacao(id)
  if (erro) return { erro }
  if (mandatoId) revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Liberação removida." }
}

// ── Instâncias ──────────────────────────────────────────────────────────────

export async function criarInstanciaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const nome = texto(formData, "nome")
  if (!nome) return { erro: "Informe o nome da instância." }
  const { id, erro } = await criarInstancia({
    nome,
    descricao: texto(formData, "descricao") || null,
  })
  if (erro) return { erro }
  revalidatePath("/painel/institucional/diretoria/instancias")
  redirect(`/painel/institucional/diretoria/instancias/${id}`)
}

export async function atualizarInstanciaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "instancia_id")
  const nome = texto(formData, "nome")
  if (!id) return { erro: "Instância inválida." }
  if (!nome) return { erro: "Informe o nome da instância." }
  const { erro } = await atualizarInstancia(id, {
    nome,
    descricao: texto(formData, "descricao") || null,
  })
  if (erro) return { erro }
  revalidatePath(`/painel/institucional/diretoria/instancias/${id}`)
  revalidatePath("/painel/institucional/diretoria/instancias")
  return { ok: "Instância salva." }
}

export async function adicionarAssentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const instanciaId = texto(formData, "instancia_id")
  const mandatoId = texto(formData, "mandato_id")
  if (!instanciaId) return { erro: "Escolha a instância." }
  if (!texto(formData, "integrante_id")) return { erro: "Escolha o diretor." }
  const documento = formData.get("documento")
  const { erro } = await adicionarAssento(
    instanciaId,
    {
      mandato_id: mandatoId || null,
      integrante_id: texto(formData, "integrante_id") || null,
      cargo: texto(formData, "cargo") || null,
      mandato_inicio: dataISO(texto(formData, "mandato_inicio")),
      mandato_fim: dataISO(texto(formData, "mandato_fim")),
    },
    documento instanceof File ? documento : undefined
  )
  if (erro) return { erro }
  revalidatePath(`/painel/institucional/diretoria/instancias/${instanciaId}`)
  if (mandatoId) revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Vínculo à instância registrado." }
}

export async function removerAssentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "assento_id")
  const instanciaId = texto(formData, "instancia_id")
  const mandatoId = texto(formData, "mandato_id")
  if (!id) return { erro: "Assento inválido." }
  const { erro } = await removerAssento(id)
  if (erro) return { erro }
  if (instanciaId)
    revalidatePath(`/painel/institucional/diretoria/instancias/${instanciaId}`)
  if (mandatoId) revalidatePath(`/painel/institucional/diretoria/${mandatoId}`, "layout")
  return { ok: "Assento removido." }
}
