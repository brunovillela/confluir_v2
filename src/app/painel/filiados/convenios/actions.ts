"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  enviarArquivoConvenio,
  excluirCategoriaConvenio,
  excluirConvenio,
  excluirUnidade,
  removerArquivoConvenio,
  salvarCategoriaConvenio,
  salvarConvenio,
  salvarUnidade,
  type ArquivoConvenio,
} from "@/lib/db/filiacao-convenios-edicao"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/
const LISTA = "/painel/filiados/convenios"

/** Quem edita convênio: a permissão da área ou a gestão da filiação. */
async function exigirEdicao() {
  return requirePermissao("filiacao_convenios", ["filiacao_gestao"])
}

const texto = (formData: FormData, campo: string) => {
  const v = String(formData.get(campo) ?? "").trim()
  return v === "" ? null : v
}
const lista = (formData: FormData, campo: string) =>
  String(formData.get(campo) ?? "")
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

function revalidar(id?: string) {
  revalidatePath(LISTA)
  revalidatePath("/portal/convenios")
  if (id) revalidatePath(`${LISTA}/${id}`)
}

// ── Convênio ───────────────────────────────────────────────────────────────

export async function salvarConvenioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = texto(formData, "convenio_id")
  if (id && !UUID.test(id)) return { erro: "Convênio inválido." }

  const conveniadorId = texto(formData, "conveniador_id")
  if (!conveniadorId || !UUID.test(conveniadorId)) return { erro: "Selecione o conveniador." }
  const categoriaId = texto(formData, "categoria_id")
  if (categoriaId && !UUID.test(categoriaId)) return { erro: "Categoria inválida." }
  const dataTermino = texto(formData, "data_termino")
  if (dataTermino && !DATA.test(dataTermino)) return { erro: "Data de término inválida." }

  const r = await salvarConvenio(
    {
      categoriaId,
      conveniadorId,
      ativo: formData.get("ativo") === "on",
      dataTermino,
      infoSumarias: texto(formData, "info_sumarias"),
      infoVantagens: texto(formData, "info_vantagens"),
    },
    id ?? undefined
  )
  if ("erro" in r) return { erro: r.erro }
  revalidar(r.id)
  redirect(`${LISTA}/${r.id}?salvo=1`)
}

export async function excluirConvenioAction(formData: FormData): Promise<void> {
  await exigirEdicao()
  const id = texto(formData, "convenio_id")
  if (!id || !UUID.test(id)) return
  const r = await excluirConvenio(id)
  if (r.erro) redirect(`${LISTA}/${id}?erro=${encodeURIComponent(r.erro)}`)
  revalidar(id)
  redirect(`${LISTA}?excluido=1`)
}

// ── Unidades ───────────────────────────────────────────────────────────────

export async function salvarUnidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const convenioId = texto(formData, "convenio_id")
  const id = texto(formData, "unidade_id")
  if (!convenioId || !UUID.test(convenioId)) return { erro: "Convênio inválido." }
  if (id && !UUID.test(id)) return { erro: "Unidade inválida." }
  const nome = texto(formData, "nome")
  if (!nome) return { erro: "Dê um nome à unidade (Loja Centro, Matriz, Atendimento online…)." }

  const r = await salvarUnidade(
    convenioId,
    {
      nome,
      site: texto(formData, "site"),
      online: formData.get("online") === "on",
      presencial: formData.get("presencial") === "on",
      telefones: lista(formData, "telefones"),
      emails: lista(formData, "emails"),
      endereco: {
        cep: texto(formData, "cep"),
        logradouro: texto(formData, "logradouro"),
        numero: texto(formData, "numero"),
        complemento: texto(formData, "complemento"),
        bairro: texto(formData, "bairro"),
        cidade: texto(formData, "cidade"),
        estado: texto(formData, "estado")?.toUpperCase().slice(0, 2) ?? null,
      },
    },
    id ?? undefined
  )
  if ("erro" in r) return { erro: r.erro }
  revalidar(convenioId)
  return { ok: id ? "Unidade salva." : "Unidade adicionada." }
}

export async function excluirUnidadeAction(formData: FormData): Promise<void> {
  await exigirEdicao()
  const convenioId = texto(formData, "convenio_id")
  const id = texto(formData, "unidade_id")
  if (!convenioId || !id || !UUID.test(convenioId) || !UUID.test(id)) return
  await excluirUnidade(convenioId, id)
  revalidar(convenioId)
}

// ── Arquivos ───────────────────────────────────────────────────────────────

function tipoArquivo(v: unknown): ArquivoConvenio | null {
  return v === "contrato" || v === "foto" ? v : null
}

export async function enviarArquivoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = texto(formData, "convenio_id")
  const tipo = tipoArquivo(formData.get("tipo"))
  if (!id || !UUID.test(id) || !tipo) return { erro: "Pedido inválido." }
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File)) return { erro: "Escolha o arquivo." }
  const r = await enviarArquivoConvenio(id, tipo, arquivo)
  if (r.erro) return { erro: r.erro }
  revalidar(id)
  return { ok: "Arquivo enviado." }
}

export async function removerArquivoAction(formData: FormData): Promise<void> {
  await exigirEdicao()
  const id = texto(formData, "convenio_id")
  const tipo = tipoArquivo(formData.get("tipo"))
  if (!id || !UUID.test(id) || !tipo) return
  await removerArquivoConvenio(id, tipo)
  revalidar(id)
}

// ── Categorias ─────────────────────────────────────────────────────────────

export async function salvarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = texto(formData, "categoria_id")
  if (id && !UUID.test(id)) return { erro: "Categoria inválida." }
  const r = await salvarCategoriaConvenio(String(formData.get("categoria") ?? ""), id ?? undefined)
  if ("erro" in r) return { erro: r.erro }
  revalidar()
  revalidatePath(`${LISTA}/categorias`)
  return { ok: id ? "Categoria salva." : "Categoria criada." }
}

export async function excluirCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = texto(formData, "categoria_id")
  if (!id || !UUID.test(id)) return { erro: "Categoria inválida." }
  const r = await excluirCategoriaConvenio(id)
  if (r.erro) return { erro: r.erro }
  revalidar()
  revalidatePath(`${LISTA}/categorias`)
  return { ok: "Categoria excluída." }
}
