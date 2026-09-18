"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import {
  atualizarDepartamento,
  criarDepartamento,
  reativarDepartamento,
  tornarLegado,
} from "@/lib/db/departamentos"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarOrganizacao,
  atualizarSede,
  subirLogo,
} from "@/lib/db/organizacao"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export async function salvarOrganizacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("configuracoes")

  const nome_razao = texto(formData, "nome_razao")
  if (!nome_razao) return { erro: "Informe a razão social." }

  const { erro } = await atualizarOrganizacao({
    nome_razao,
    nome_fantasia: texto(formData, "nome_fantasia") || null,
    cnpj_cpf: texto(formData, "cnpj_cpf").replace(/\D/g, "") || null,
    site_url: texto(formData, "site_url") || null,
    email_contato: texto(formData, "email_contato") || null,
    noticias_url: texto(formData, "noticias_url") || null,
    noticias_feed_url: texto(formData, "noticias_feed_url") || null,
  })
  if (erro) return { erro }

  // Logo é opcional — só sobe se um arquivo foi enviado.
  const arquivo = formData.get("logo")
  if (arquivo instanceof File && arquivo.size > 0) {
    const res = await subirLogo(arquivo)
    if (res.erro) return { erro: res.erro }
  }

  revalidatePath("/painel/institucional/organizacao", "layout")
  return { ok: "Organização salva." }
}

const UUID = /^[0-9a-f-]{36}$/i

/** Cria ou atualiza um departamento com coordenador e integrantes. */
export async function salvarDepartamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("configuracoes")
  const id = texto(formData, "departamento_id")
  const nome = texto(formData, "nome")
  if (!nome) return { erro: "Informe o nome do departamento." }
  const coordenador = texto(formData, "coordenador_id")
  const integrantes = formData
    .getAll("integrantes")
    .map((v) => String(v))
    .filter((v) => UUID.test(v))
  const dados = {
    nome,
    coordenadorId: UUID.test(coordenador) ? coordenador : null,
    integrantes,
  }
  if (id) {
    const { erro } = await atualizarDepartamento(id, dados)
    if (erro) return { erro }
    revalidatePath("/painel/institucional/organizacao", "layout")
    return { ok: "Departamento salvo." }
  }
  const { id: novoId, erro } = await criarDepartamento(dados)
  if (erro || !novoId) return { erro: erro ?? "Não foi possível criar o departamento." }
  revalidatePath("/painel/institucional/organizacao", "layout")
  // Criado: abre a página do departamento.
  redirect(`/painel/institucional/organizacao/departamentos/${novoId}`)
}

/** Desativa o departamento (legado): só sem pessoas e sem coordenador. */
export async function tornarLegadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("configuracoes")
  const id = texto(formData, "departamento_id")
  if (!UUID.test(id)) return { erro: "Departamento inválido." }
  const { erro } = await tornarLegado(id)
  if (erro) return { erro }
  revalidatePath("/painel/institucional/organizacao", "layout")
  return { ok: "Departamento tornado legado." }
}

export async function reativarDepartamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("configuracoes")
  const id = texto(formData, "departamento_id")
  if (!UUID.test(id)) return { erro: "Departamento inválido." }
  const { erro } = await reativarDepartamento(id)
  if (erro) return { erro }
  revalidatePath("/painel/institucional/organizacao", "layout")
  return { ok: "Departamento reativado." }
}

export async function salvarSedeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("configuracoes")
  const id = texto(formData, "sede_id")
  if (!id) return { erro: "Sede inválida." }

  const { erro } = await atualizarSede(id, {
    cep: texto(formData, "cep").replace(/\D/g, "") || null,
    logradouro: texto(formData, "logradouro") || null,
    numero: texto(formData, "numero") || null,
    complemento: texto(formData, "complemento") || null,
    bairro: texto(formData, "bairro") || null,
    cidade: texto(formData, "cidade") || null,
    estado: texto(formData, "estado").toUpperCase().slice(0, 2) || null,
    telefones: texto(formData, "telefones") || null,
  })
  if (erro) return { erro }

  revalidatePath("/painel/institucional/organizacao", "layout")
  return { ok: "Sede salva." }
}
