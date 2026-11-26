import "server-only"

import { texto } from "@/lib/db/comum"
import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  escolherPrincipal,
  nomeComparavel,
  padraoDoNome,
  preferencia,
} from "@/lib/usuarios-duplicados-regras"

export { escolherPrincipal }

/**
 * Cadastros repetidos da mesma pessoa em `usuarios` (25/11/2026).
 *
 * POR QUÊ: o Bubble criava a conta de login separada da ficha que a pessoa já
 * tinha, e 1.700+ pessoas chegaram com dois ou mais cadastros. Quando uma
 * delas entra na diretoria, o integrante era ligado ao cadastro MAIS ANTIGO
 * pelo CPF — a ficha antiga, não a conta com login —, e a pessoa não
 * conseguia pedir viagem, diária etc. (Heron Franco, Marcos Cardozo, Marcelo
 * Py). Aqui ficam: a escolha do cadastro certo pelo CPF, a procura dos outros
 * cadastros de uma pessoa e a unificação pela função do banco.
 */

export type CadastroDaPessoa = {
  usuarioId: string
  nome: string | null
  email: string | null
  cpf: string | null
  temLogin: boolean
  temAcesso: boolean
  /** Id da linha de `permissoes` (a rota de Gestão › Usuários usa este). */
  acessoId: string | null
  criadoEm: string | null
  motivo: "cpf" | "nome"
}

type Linha = Record<string, unknown>

/** Quem dos cadastros tem login e quem tem acesso (linha de permissões). */
async function enriquecer(linhas: Linha[]): Promise<Map<string, { acessoId: string | null }>> {
  const ids = linhas.map((l) => String(l.id))
  const mapa = new Map<string, { acessoId: string | null }>(ids.map((i) => [i, { acessoId: null }]))
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin.from("permissoes").select("id, usuario_id").in("usuario_id", ids)
  for (const p of data ?? []) mapa.set(String(p.usuario_id), { acessoId: String(p.id) })
  return mapa
}

const COLUNAS = "id, nome_completo, email, cpf, auth_user_id, created_at"

function paraCadastro(l: Linha, acessoId: string | null, motivo: "cpf" | "nome"): CadastroDaPessoa {
  return {
    usuarioId: String(l.id),
    nome: texto(l.nome_completo),
    email: texto(l.email),
    cpf: texto(l.cpf),
    temLogin: Boolean(l.auth_user_id),
    temAcesso: Boolean(acessoId),
    acessoId,
    criadoEm: texto(l.created_at),
    motivo,
  }
}

/** Cadastros vivos (não excluídos nem unificados) com este CPF, o preferido primeiro. */
export async function cadastrosPorCpf(
  cpfBruto: string | null | undefined,
  emp?: string
): Promise<CadastroDaPessoa[]> {
  const cpf = cpfConfiavel(cpfBruto)
  if (!cpf) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select(COLUNAS)
    .eq("emp_proprietaria_id", emp ?? (await tenantAtual()))
    .in("cpf", grafiasDoCpf(cpf))
    .not("deletado", "is", true)
    .is("unificado_em_id", null)
    .limit(20)
  const linhas = data ?? []
  const extra = await enriquecer(linhas)
  return linhas
    .map((l) => paraCadastro(l, extra.get(String(l.id))?.acessoId ?? null, "cpf"))
    .sort(preferencia)
}

/**
 * O cadastro a usar para um CPF: o que tem login; sem login, o que tem
 * acesso; sem nenhum dos dois, o mais antigo. Null se não houver.
 */
export async function usuarioPreferidoPorCpf(
  cpf: string | null | undefined,
  emp?: string
): Promise<string | null> {
  return (await cadastrosPorCpf(cpf, emp))[0]?.usuarioId ?? null
}

/** Cadastros vivos com o mesmo nome completo (sem acento e sem caixa). */
export async function cadastrosPorNome(nome: string | null | undefined): Promise<CadastroDaPessoa[]> {
  const alvo = nomeComparavel(nome)
  const padrao = nome ? padraoDoNome(nome) : null
  if (!padrao || alvo.split(" ").length < 2) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select(COLUNAS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .ilike("nome_completo", padrao)
    .not("deletado", "is", true)
    .is("unificado_em_id", null)
    .limit(200)
  const linhas = (data ?? []).filter((l) => nomeComparavel(texto(l.nome_completo)) === alvo)
  const extra = await enriquecer(linhas)
  return linhas
    .map((l) => paraCadastro(l, extra.get(String(l.id))?.acessoId ?? null, "nome"))
    .sort(preferencia)
}

/**
 * Os OUTROS cadastros da pessoa deste usuário: mesmo CPF ou mesmo nome
 * completo. Nome igual com CPFs diferentes (os dois preenchidos) são pessoas
 * diferentes e ficam de fora.
 */
export async function outrosCadastrosDaPessoa(usuarioId: string): Promise<CadastroDaPessoa[]> {
  const admin = await createAdminClient()
  const { data: u } = await admin
    .from("usuarios")
    .select("id, nome_completo, cpf")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!u) return []
  const meuCpf = cpfConfiavel(texto(u.cpf))
  const [porCpf, porNome] = await Promise.all([
    cadastrosPorCpf(meuCpf),
    cadastrosPorNome(texto(u.nome_completo)),
  ])
  const vistos = new Set<string>([usuarioId])
  const saida: CadastroDaPessoa[] = []
  for (const c of [...porCpf, ...porNome]) {
    if (vistos.has(c.usuarioId)) continue
    const outroCpf = cpfConfiavel(c.cpf)
    if (c.motivo === "nome" && meuCpf && outroCpf && outroCpf !== meuCpf) continue
    vistos.add(c.usuarioId)
    saida.push(c)
  }
  return saida.sort(preferencia)
}

// ── Unificação ───────────────────────────────────────────────────────────────

export const AVISO_SQL_UNIFICACAO =
  "As duas contas têm acesso, e a unificação ainda não junta as permissões. Rode a migração 20261126005810_unificar_usuarios_permissoes.sql no Supabase antes."

/**
 * Unifica o `secundario` no `principal` pela função do banco: as referências
 * passam para o principal, campos vazios dele são completados e o secundário
 * fica inativo, marcado como unificado (não é apagado). Simula antes: se as
 * duas contas têm acesso e a função ainda é a antiga (sem juntar as
 * permissões, o que derrubaria o login), recusa.
 */
export async function unificarUsuarios(
  principal: string,
  secundario: string,
  autorId: string
): Promise<{ erro?: string; movidos?: Record<string, unknown> }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const args = { p_emp: emp, p_principal: principal, p_secundario: secundario, p_autor: autorId }

  const simulacao = await admin.rpc("unificar_usuarios", { ...args, p_simular: true })
  if (simulacao.error) return { erro: simulacao.error.message }
  const relatorio = (simulacao.data ?? {}) as Record<string, unknown>
  if (!("permissoes_unidas" in relatorio)) {
    const { data: linhas } = await admin
      .from("permissoes")
      .select("usuario_id")
      .in("usuario_id", [principal, secundario])
    const donos = new Set((linhas ?? []).map((l) => String(l.usuario_id)))
    if (donos.size === 2) return { erro: AVISO_SQL_UNIFICACAO }
  }

  const { data, error } = await admin.rpc("unificar_usuarios", { ...args, p_simular: false })
  if (error) return { erro: error.message }
  return { movidos: ((data as { movidos?: Record<string, unknown> })?.movidos ?? {}) }
}
