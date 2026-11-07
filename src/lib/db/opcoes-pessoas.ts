import "server-only"

import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Seletor de pessoa que não apaga o valor gravado.
 *
 * As listas de opções mostram só quem está ativo hoje. Quando o registro
 * aponta para alguém que saiu da lista (inativo, excluído, sem acesso), o
 * <select> do navegador não acha o valor e mostra a primeira opção — e quem
 * salva sem reparar apaga ou troca o responsável. Aqui a pessoa gravada volta
 * à lista, marcada, para continuar selecionada.
 */

export type OpcaoPessoa = { id: string; nome: string }

function nomeDe(u: Record<string, unknown>): string {
  return (
    [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    ) ?? "(sem nome)"
  )
}

/**
 * Acrescenta às opções quem está em `atuais` e não está nelas. `montar`
 * completa os campos extras do tipo da opção (ex.: nível de acesso).
 */
export async function comPessoasAtuais<T extends OpcaoPessoa>(
  opcoes: T[],
  atuais: (string | null | undefined)[],
  montar: (pessoa: OpcaoPessoa) => T = (p) => p as T
): Promise<T[]> {
  const presentes = new Set(opcoes.map((o) => o.id))
  const faltam = [...new Set(atuais.filter((a): a is string => !!a && !presentes.has(a)))]
  if (faltam.length === 0) return opcoes

  const admin = await createAdminClient()
  const extras: T[] = []
  for (let de = 0; de < faltam.length; de += 200) {
    const { data } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra, deletado, unificado_em_id")
      .in("id", faltam.slice(de, de + 200))
    for (const u of (data ?? []) as Record<string, unknown>[]) {
      const marca = texto(u.unificado_em_id)
        ? "cadastro unificado — escolha de novo"
        : u.deletado === true
          ? "cadastro excluído"
          : "fora da lista"
      extras.push(montar({ id: String(u.id), nome: `${nomeDe(u)} (${marca})` }))
    }
  }
  return [...opcoes, ...extras]
}
