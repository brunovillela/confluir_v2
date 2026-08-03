"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  excluirTipoAtendimento,
  salvarProfissional,
  salvarTipoAtendimento,
} from "@/lib/db/atendimentos"

/**
 * Cadastro de tipos e profissionais.
 *
 * Gate em `saude_gestao`: definir QUEM é profissional de QUAL tipo é ato
 * administrativo, e é o que alimenta o controle de acesso ao relatório.
 * Quem administra concede a habilitação — mas continua sem ler o conteúdo
 * clínico, salvo se for profissional habilitado por este mesmo cadastro.
 */
const PERMISSAO = "saude_gestao"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export async function salvarTipoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const id = texto(formData, "id") || undefined
  const { erro } = await salvarTipoAtendimento(texto(formData, "nome"), id)
  if (erro) return { erro }
  revalidatePath("/painel/saude/profissionais")
  redirect("/painel/saude/profissionais?salvo=tipo")
}

export async function excluirTipoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const { erro } = await excluirTipoAtendimento(texto(formData, "id"))
  if (erro) return { erro }
  revalidatePath("/painel/saude/profissionais")
  redirect("/painel/saude/profissionais?excluido=tipo")
}

export async function salvarProfissionalAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)

  const id = texto(formData, "id") || undefined
  const acessoTodos = formData.get("acesso_todos_tipos") === "on"
  const tipoId = texto(formData, "tipo_id")

  // Sem tipo e sem coordenação, o cadastro não habilita a ler nada — o que
  // quase sempre é engano de preenchimento, não intenção.
  if (!tipoId && !acessoTodos) {
    return {
      erro:
        "Escolha o tipo de atendimento, ou marque coordenação clínica. Sem um dos dois, o profissional não lê nenhum relatório.",
    }
  }

  const { erro } = await salvarProfissional(
    {
      usuario_id: texto(formData, "usuario_id"),
      profissao: texto(formData, "profissao"),
      conselho_classe: texto(formData, "conselho_classe"),
      registro_conselho: texto(formData, "registro_conselho"),
      tipo_id: tipoId,
      acesso_todos_tipos: acessoTodos,
      inativo: formData.get("inativo") === "on",
    },
    id
  )
  if (erro) return { erro }

  revalidatePath("/painel/saude/profissionais")
  redirect("/painel/saude/profissionais?salvo=profissional")
}
