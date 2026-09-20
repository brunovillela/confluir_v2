"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  descartarCopias,
  ignorarGrupoCat,
  restaurarCopia,
  vincularAtualizacoes,
  type TipoGrupoCat,
} from "@/lib/db/cat-duplicidades"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ids = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .filter((id) => UUID.test(id))

function revalidar() {
  revalidatePath("/painel/saude/cat", "layout")
  revalidatePath("/painel/saude")
}

/** CAT repetida: fica a escolhida; as outras viram cópia descartada (nada é apagado). */
export async function descartarCopiasAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("saude_cat", ["saude_gestao"])
  const manter = String(formData.get("manter") ?? "")
  if (!UUID.test(manter)) return { erro: "Escolha a CAT que fica." }
  const { erro } = await descartarCopias(manter, ids(formData.get("cats")), sessao.usuario.id as string)
  if (erro) return { erro }
  revalidar()
  return { ok: "Cópias descartadas — fica só a CAT escolhida." }
}

/** Reabertura/óbito: liga as outras CATs do grupo à escolhida como CAT de origem. */
export async function vincularAtualizacaoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermissao("saude_cat", ["saude_gestao"])
  const origem = String(formData.get("origem") ?? "")
  if (!UUID.test(origem)) return { erro: "Escolha a CAT de origem." }
  const { erro } = await vincularAtualizacoes(origem, ids(formData.get("cats")))
  if (erro) return { erro }
  revalidar()
  return { ok: "Atualizações ligadas à CAT de origem." }
}

export async function ignorarGrupoCatAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("saude_cat", ["saude_gestao"])
  const tipo = String(formData.get("tipo") ?? "") as TipoGrupoCat
  if (!["numero", "atualizacao", "acidente"].includes(tipo)) return { erro: "Grupo inválido." }
  const { erro } = await ignorarGrupoCat({
    tipo,
    chave: String(formData.get("chave") ?? ""),
    cats: ids(formData.get("cats")),
    motivo: String(formData.get("motivo") ?? "").trim() || null,
    usuarioId: sessao.usuario.id as string,
  })
  if (erro) return { erro }
  revalidar()
  return { ok: "Grupo conferido — sai da lista." }
}

/** Desfaz o descarte de uma cópia (na página da CAT que ficou). */
export async function restaurarCopiaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermissao("saude_cat", ["saude_gestao"])
  const id = String(formData.get("id") ?? "")
  if (!UUID.test(id)) return { erro: "CAT inválida." }
  const { erro } = await restaurarCopia(id)
  if (erro) return { erro }
  revalidar()
  return { ok: "A cópia voltou para a lista de CATs." }
}
