import "server-only"
import { tenantAtual } from "@/lib/tenant"

import type { EmpresaOpcao } from "@/components/empresa-combobox"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Listas de apoio das telas de CIPA.
 *
 * Separado de db/cipa.ts porque estas funções leem `empresa` e `usuarios` —
 * não são domínio da CIPA, só alimentam os seletores.
 */

/**
 * Empresas para o seletor. `bloqueado` vai sempre false: bloqueio é conceito
 * de FORNECEDOR (compras), e uma empresa bloqueada como fornecedora segue
 * existindo como empresa com CIPA.
 */
export async function empresasParaSelecao(): Promise<EmpresaOpcao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa")
    .select("id,nome_fantasia,nome_razao,cnpj_cpf")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome_fantasia")
    .limit(3000)

  // Não engolir o erro: uma coluna inexistente no select faz o PostgREST
  // recusar a query inteira, e devolver [] silenciosamente só produz um
  // seletor vazio sem explicação. (Aconteceu: `razao_social` não existe
  // nesta tabela — a coluna certa é `nome_razao`.)
  if (error) throw new Error(`Falha ao listar empresas: ${error.message}`)

  return ((data ?? []) as {
    id: string
    nome_fantasia: string | null
    nome_razao: string | null
    cnpj_cpf: string | null
  }[])
    .map((e) => ({
      id: e.id,
      nome: e.nome_fantasia ?? e.nome_razao ?? "(sem nome)",
      cnpj_cpf: e.cnpj_cpf,
      bloqueado: false,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/** Funcionários ativos, para indicar representante do sindicato. */
export async function usuariosAtivos(): Promise<
  { id: string; nome: string }[]
> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id,nome_completo,inativo,deletado")
    .order("nome_completo")
    .limit(2000)

  return ((data ?? []) as {
    id: string
    nome_completo: string | null
    inativo: boolean | null
    deletado: boolean | null
  }[])
    .filter((u) => u.inativo !== true && u.deletado !== true && u.nome_completo)
    .map((u) => ({ id: u.id, nome: u.nome_completo! }))
}
