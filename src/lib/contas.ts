import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

export type EstadoForm = {
  erro?: string
  ok?: string
}

/**
 * Modelo de identidade do filiado: o CPF é o identificador único da pessoa.
 * A tabela `filiacoes` tem em média ~3 registros por CPF (histórico de
 * filiações migrado do Bubble) — os registros são agregados aqui e tratados
 * como UMA pessoa. A conta de acesso (Supabase Auth) guarda o CPF em
 * `user_metadata.cpf`, e a sessão do portal resolve os dados a partir dele.
 */
export type Filiado = {
  cpf: string
  nome_completo: string | null
  email: string | null
  /** Registro de filiação mais recente (para telas de detalhe). */
  filiacaoId: string
  /** Quantidade de registros de filiação agregados. */
  registros: number
  /**
   * Algum registro da pessoa tem filiacao_condicao = 'Ativo'. Portal e
   * votação exigem filiação ativa (regra do Bubble — Filiação Condição).
   */
  ativo: boolean
}

/** Busca a pessoa filiada pelo CPF (sem máscara), agregando os registros. */
export async function buscarFiliadoPorCpf(
  cpfLimpo: string
): Promise<Filiado | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select(
      "id, nome_completo, email_pessoal, email_corporativo, filiacao_condicao, updated_at"
    )
    .eq("cpf", cpfLimpo)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })

  if (!data || data.length === 0) return null

  const email =
    data.map((f) => f.email_pessoal ?? f.email_corporativo).find(Boolean) ??
    null
  const nome = data.map((f) => f.nome_completo).find(Boolean) ?? null

  return {
    cpf: cpfLimpo,
    nome_completo: nome,
    email,
    filiacaoId: data[0].id,
    registros: data.length,
    ativo: data.some((f) => f.filiacao_condicao === "Ativo"),
  }
}

/** joao.silva@gmail.com → j•••••••••@g•••••.com */
export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@")
  if (!dominio) return "•••"
  const [nome, ...resto] = dominio.split(".")
  const mascarar = (s: string) =>
    s.length <= 1 ? s : s[0] + "•".repeat(Math.min(s.length - 1, 8))
  return `${mascarar(usuario)}@${mascarar(nome)}${resto.length ? "." + resto.join(".") : ""}`
}
