import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Quem é FILIADO ATIVO — a régua, num lugar só.
 *
 * Vale a **condição sindical do cadastro** (`filiacoes.filiacao_condicao`),
 * que é onde ela sempre morou. Antes eu derivava a resposta do histórico de
 * vínculos ("último vínculo em aberto") por ter lido a condição na tabela
 * errada: a coluna homônima de `filiacao_vinculos` está nula em 10.823 dos
 * 10.824 vínculos, e concluí que o campo não tinha vindo da migração. Ele
 * veio — no cadastro, preenchido em 19.932 dos 20.107 registros.
 *
 * O preço daquele engano foi grande: o histórico de vínculos **não existe
 * para metade da base**. Os 10.824 vínculos nasceram no Bubble num único lote
 * de setembro de 2025 que cobriu só metade dos cadastros, e nenhuma filiação
 * posterior ganhou o seu. Resultado medido em 07/09: pelo vínculo eram 8.155
 * ativos, dos quais apenas 4.573 pagavam a contribuição — e 4.549 pagantes
 * ficavam de fora, 4.147 deles pagando desde outubro de 2021 ou antes. Pela
 * condição do cadastro são 10.816, dos quais 8.854 pagam.
 *
 * Nenhum dos dois é perfeito; a condição do cadastro erra bem menos, e é o
 * campo que a secretaria de fato mantém.
 *
 * A varredura é cacheada: passa por todos os cadastros do tenant, e a
 * resposta muda devagar.
 */

const VALIDADE_CACHE_MS = 10 * 60 * 1000

/** O valor que a entidade usa para "está filiado agora". */
export const CONDICAO_ATIVO = "Ativo"

export type FiliadoAtivo = {
  id: string
  cpf: string | null
  nome: string | null
  matricula: string | null
}

let cache: { dados: Map<string, FiliadoAtivo>; expira: number } | null = null

export function invalidarCacheAtivos() {
  cache = null
}

/**
 * Cadastros com condição **Ativo**, por id.
 *
 * Fora ficam os excluídos do quadro e os anonimizados por pedido de LGPD —
 * de quem foi anonimizado não sobrou nome nem CPF para cobrar nada.
 */
export async function filiadosAtivos(): Promise<Map<string, FiliadoAtivo>> {
  if (cache && cache.expira > Date.now()) return cache.dados

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const dados = new Map<string, FiliadoAtivo>()
  const LOTE = 1000
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await admin
      .from("filiacoes")
      .select("id, cpf, nome_completo, matricula_sindical")
      .eq("emp_proprietaria_id", emp)
      .eq("filiacao_condicao", CONDICAO_ATIVO)
      .not("filiacao_excluida", "is", true)
      .is("anonimizada_em", null)
      // Sem uma ordem estável, linhas repetem ou somem entre um lote e outro.
      .order("id", { ascending: true })
      .range(de, de + LOTE - 1)
    if (error) throw new Error(`Falha ao ler filiados ativos: ${error.message}`)
    for (const f of data ?? []) {
      dados.set(f.id as string, {
        id: f.id as string,
        cpf: (f.cpf as string | null) ?? null,
        nome: (f.nome_completo as string | null) ?? null,
        matricula: (f.matricula_sindical as string | null) ?? null,
      })
    }
    if (!data || data.length < LOTE) break
  }

  cache = { dados, expira: Date.now() + VALIDADE_CACHE_MS }
  return dados
}

/** Os CPFs dos ativos — o que os relatórios por contribuição precisam. */
export async function cpfsDeFiliadosAtivos(): Promise<Set<string>> {
  const ativos = await filiadosAtivos()
  const cpfs = new Set<string>()
  for (const f of ativos.values()) if (f.cpf) cpfs.add(f.cpf)
  return cpfs
}
