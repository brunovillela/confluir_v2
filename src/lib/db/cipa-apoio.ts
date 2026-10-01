import "server-only"
import { tenantAtual } from "@/lib/tenant"

import type { EmpresaOpcao } from "@/components/empresa-combobox"
import { lerEmLotes } from "@/lib/db/comum"
import { listarUsuariosAtivos } from "@/lib/db/veiculos"
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
  const emp = await tenantAtual()
  // Em lotes: o PostgREST corta em 1.000 linhas (o .limit(3000) antigo não
  // passava disso) e o cadastro de empresas já tem mais de 1.600.
  // Não engolir o erro: uma coluna inexistente no select faz o PostgREST
  // recusar a query inteira, e devolver [] silenciosamente só produz um
  // seletor vazio sem explicação. (Aconteceu: `razao_social` não existe
  // nesta tabela — a coluna certa é `nome_razao`.)
  let data: Record<string, unknown>[]
  try {
    data = await lerEmLotes((de, ate) =>
      admin
        .from("empresa")
        .select("id,nome_fantasia,nome_razao,cnpj_cpf")
        .eq("emp_proprietaria_id", emp)
        .order("nome_fantasia")
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    throw new Error(`Falha ao listar empresas: ${(e as Error).message}`)
  }

  return (data as {
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
  // Quem tem acesso ao painel (funcionários e diretores). Ler `usuarios`
  // inteiro trazia os 12 mil filiados e o PostgREST cortava em 1.000 —
  // o seletor parava em "Antônio".
  return listarUsuariosAtivos()
}
