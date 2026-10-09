"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarEmpregador,
  adicionarEmpresaExterna,
  atualizarGrupo,
  criarGrupo,
  excluirGrupo,
  removerMembro,
} from "@/lib/db/grupos-empresariais"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE = "/painel/representacao/empregadores"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function revalidar(grupoId?: string) {
  revalidatePath(`${BASE}/grupos`)
  if (grupoId) revalidatePath(`${BASE}/grupos/${grupoId}`)
  // Selo do grupo no empregador e filtros das listas.
  revalidatePath(BASE, "layout")
  revalidatePath("/painel/filiados/receitas", "layout")
}

function lerDados(fd: FormData) {
  const pagadora = texto(fd, "empresa_pagadora_id")
  return {
    nome: texto(fd, "nome"),
    descricao: texto(fd, "descricao") || null,
    contribuicaoCentralizada: fd.get("contribuicao_centralizada") === "on",
    empresaPagadoraId: UUID.test(pagadora) ? pagadora : null,
  }
}

export async function salvarGrupoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const id = texto(fd, "grupo_id")
  const dados = lerDados(fd)
  if (!dados.nome) return { erro: "Informe o nome do grupo." }

  if (id) {
    if (!UUID.test(id)) return { erro: "Grupo inválido." }
    const { erro } = await atualizarGrupo(id, dados)
    if (erro) return { erro }
    revalidar(id)
    redirect(`${BASE}/grupos/${id}?salvo=1`)
  }

  const { id: novo, erro } = await criarGrupo(dados)
  if (erro || !novo) return { erro: erro ?? "Não foi possível criar o grupo." }
  // Empregadores marcados na criação.
  const avisos: string[] = []
  for (const empresaId of fd.getAll("empregador").map(String).filter((v) => UUID.test(v))) {
    const r = await adicionarEmpregador(novo, empresaId)
    if (r.erro) avisos.push(r.erro)
  }
  revalidar(novo)
  redirect(`${BASE}/grupos/${novo}?criado=1${avisos.length ? `&avisos=${avisos.length}` : ""}`)
}

export async function excluirGrupoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const id = texto(fd, "grupo_id")
  if (!UUID.test(id)) return { erro: "Grupo inválido." }
  const { erro } = await excluirGrupo(id)
  if (erro) return { erro }
  revalidar()
  redirect(`${BASE}/grupos?excluido=1`)
}

export async function adicionarEmpregadorAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const grupoId = texto(fd, "grupo_id")
  const empresaId = texto(fd, "empresa_id")
  if (!UUID.test(grupoId) || !UUID.test(empresaId)) return { erro: "Escolha o empregador." }
  const { erro } = await adicionarEmpregador(grupoId, empresaId)
  if (erro) return { erro }
  revalidar(grupoId)
  return { ok: "Empregador incluído no grupo." }
}

export async function adicionarEmpresaExternaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const grupoId = texto(fd, "grupo_id")
  if (!UUID.test(grupoId)) return { erro: "Grupo inválido." }
  const nome = texto(fd, "nome")
  const cnpj = texto(fd, "cnpj").replace(/\D/g, "") || null
  if (!nome) return { erro: "Informe o nome da empresa." }
  if (cnpj && cnpj.length !== 14) return { erro: "CNPJ inválido — confira os 14 dígitos." }
  const { erro } = await adicionarEmpresaExterna(grupoId, { nome, cnpj })
  if (erro) return { erro }
  revalidar(grupoId)
  return { ok: "Empresa incluída no grupo." }
}

export async function removerMembroAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const grupoId = texto(fd, "grupo_id")
  const membroId = texto(fd, "membro_id")
  if (!UUID.test(grupoId) || !UUID.test(membroId)) return { erro: "Empresa inválida." }
  const { erro } = await removerMembro(membroId)
  if (erro) return { erro }
  revalidar(grupoId)
  return { ok: "Empresa retirada do grupo." }
}
