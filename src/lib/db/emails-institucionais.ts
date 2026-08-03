import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { listarFuncionarios } from "@/lib/db/pessoal"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * E-mails institucionais — registro simples dos endereços da organização
 * (presidencia@, juridico@…) e o funcionário responsável por cada um. Tabela
 * `emails_institucionais` (endereco, usuario_id → usuarios, emp_proprietaria_id)
 * já existe e é tenant-owned (RLS). Escopo confirmado com o Bruno: "controlar
 * o email institucional, só isso" — sem caixa de entrada, encaminhamento etc.
 */

export type EmailInstitucional = {
  id: string
  endereco: string
  usuarioId: string | null
  responsavelNome: string | null
  created_at: string | null
}

/** Regex pragmática de e-mail (não RFC completo — barra erros grosseiros). */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function nomeUsuario(u: Record<string, unknown> | undefined): string | null {
  if (!u) return null
  return (
    [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    ) ?? null
  )
}

export async function listarEmailsInstitucionais(
  busca?: string
): Promise<EmailInstitucional[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("emails_institucionais")
    .select("id, endereco, usuario_id, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("endereco", { ascending: true })
    .limit(1000)
  if (error) {
    throw new Error(`Falha ao listar e-mails institucionais: ${error.message}`)
  }

  const linhas = (data ?? []) as Record<string, unknown>[]
  const usuarioIds = [
    ...new Set(linhas.map((l) => texto(l.usuario_id)).filter(Boolean)),
  ] as string[]
  const nomes = new Map<string, string>()
  if (usuarioIds.length) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", usuarioIds)
    for (const u of (us ?? []) as Record<string, unknown>[]) {
      const nome = nomeUsuario(u)
      if (nome) nomes.set(String(u.id), nome)
    }
  }

  const termo = (busca ?? "").trim().toLocaleLowerCase("pt-BR")
  return linhas
    .map((l) => {
      const usuarioId = texto(l.usuario_id)
      return {
        id: String(l.id),
        endereco: String(l.endereco ?? ""),
        usuarioId,
        responsavelNome: usuarioId ? (nomes.get(usuarioId) ?? null) : null,
        created_at: texto(l.created_at),
      }
    })
    .filter(
      (e) =>
        !termo ||
        e.endereco.toLocaleLowerCase("pt-BR").includes(termo) ||
        (e.responsavelNome ?? "").toLocaleLowerCase("pt-BR").includes(termo)
    )
}

/** Funcionários ativos para o seletor de responsável. */
export async function opcoesResponsaveis(): Promise<
  { id: string; nome: string }[]
> {
  const { linhas } = await listarFuncionarios({ situacao: "ativos" })
  return linhas
    .map((f) => ({ id: f.usuarioId, nome: f.nome ?? "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

export type DadosEmail = { endereco: string; usuarioId: string | null }

/** Rejeita endereço vazio/inválido ou duplicado no tenant (fora o próprio). */
async function validar(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  endereco: string,
  ignorarId?: string
): Promise<string | null> {
  if (!RE_EMAIL.test(endereco)) return "Informe um endereço de e-mail válido."
  let q = admin
    .from("emails_institucionais")
    .select("id")
    .eq("emp_proprietaria_id", empId)
    .ilike("endereco", endereco)
  if (ignorarId) q = q.neq("id", ignorarId)
  const { data } = await q.limit(1)
  if ((data ?? []).length > 0) return "Esse e-mail já está cadastrado."
  return null
}

export async function criarEmailInstitucional(
  dados: DadosEmail
): Promise<{ id?: string; erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const endereco = dados.endereco.trim().toLocaleLowerCase("pt-BR")
  const erro = await validar(admin, empId, endereco)
  if (erro) return { erro }

  const { data, error } = await admin
    .from("emails_institucionais")
    .insert({
      endereco,
      usuario_id: dados.usuarioId,
      emp_proprietaria_id: empId,
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao cadastrar o e-mail: ${error.message}` }
  return { id: String(data.id) }
}

export async function atualizarEmailInstitucional(
  id: string,
  dados: DadosEmail
): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const endereco = dados.endereco.trim().toLocaleLowerCase("pt-BR")
  const erro = await validar(admin, empId, endereco, id)
  if (erro) return { erro }

  const { error } = await admin
    .from("emails_institucionais")
    .update({ endereco, usuario_id: dados.usuarioId })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao salvar o e-mail: ${error.message}` }
  return {}
}

export async function excluirEmailInstitucional(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("emails_institucionais")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir o e-mail: ${error.message}` }
  return {}
}
